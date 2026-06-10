package com.fyp.backend.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseEnrollment;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.CourseWishlist;
import com.fyp.backend.model.ResourceProgress;
import com.fyp.backend.model.UserVideoProgress;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

@Service
public class EnrollmentService {

    @Autowired private CourseEnrollmentRepository enrollmentRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private CourseSectionRepository sectionRepository;
    @Autowired private CourseVideoRepository videoRepository;
    @Autowired private CourseResourceRepository courseResourceRepository;
    @Autowired private CourseWishlistRepository wishlistRepository;
    @Autowired private UserVideoProgressRepository videoProgressRepository;
    @Autowired private ResourceProgressRepository resourceProgressRepository;
    @Autowired private ProgressService progressService;
    @Autowired private CourseService courseService;
    @Autowired private PushNotificationService pushNotificationService;
    @Autowired private CertificateService certificateService;
    @Autowired private GoalService goalService;

    @Transactional
    public Map<String, Object> enroll(Long userId, Long courseId) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));

        CourseEnrollment enrollment = enrollmentRepository.findByUserIdAndCourseId(userId, courseId).orElse(null);
        boolean already = enrollment != null;
        if (!already) {
            enrollment = new CourseEnrollment();
            enrollment.setUserId(userId);
            enrollment.setCourseId(courseId);
            enrollment = enrollmentRepository.save(enrollment);
            course.setStudentCount((course.getStudentCount() == null ? 0 : course.getStudentCount()) + 1);
            courseRepository.save(course);
            pushNotificationService.notifyLearningEvent(userId, "Enrolled",
                    "You're enrolled in \"" + course.getTitle() + "\". Time to start learning!");
        }

        List<CourseSection> sections = sectionRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        String firstModuleId = sections.isEmpty() ? null : String.valueOf(sections.get(0).getId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("enrollment_id", String.valueOf(enrollment.getId()));
        data.put("firstModuleId", firstModuleId);
        data.put("alreadyEnrolled", already);
        return data;
    }

    public boolean isEnrolled(Long userId, Long courseId) {
        return enrollmentRepository.existsByUserIdAndCourseId(userId, courseId);
    }

    public Map<String, Object> getUserEnrollment(Long userId) {
        List<CourseEnrollment> enrollments = enrollmentRepository.findByUserId(userId);
        enrollments.sort(Comparator.comparing(CourseEnrollment::getLastActivityAt,
                Comparator.nullsFirst(Comparator.naturalOrder())).reversed());

        List<Map<String, Object>> list = new ArrayList<>();
        int completedCount = 0;
        double progressSum = 0;
        int watchMinutes = 0;

        for (CourseEnrollment e : enrollments) {
            Course course = courseRepository.findById(e.getCourseId()).orElse(null);
            if (course == null) continue;

            Map<String, Object> m = courseService.courseSummaryMap(course);
            m.put("enrollment_id", String.valueOf(e.getId()));
            m.put("course_id", String.valueOf(e.getCourseId()));
            m.put("progress_percentage", e.getProgressPercentage());
            m.put("is_completed", e.isCompleted());
            m.put("total_watch_time_minutes", e.getTotalWatchTimeMinutes());
            m.put("last_activity_at", e.getLastActivityAt());
            long totalSections = progressService.sectionCount(e.getCourseId());
            m.put("total_sections", totalSections);
            m.put("completed_sections", progressService.completedSectionCount(userId, e.getCourseId()));
            m.put("completed_videos", progressService.completedVideoCount(userId, e.getCourseId()));
            m.put("is_in_wishlist", wishlistRepository.existsByUserIdAndCourseId(userId, e.getCourseId()));
            list.add(m);

            if (e.isCompleted()) completedCount++;
            progressSum += e.getProgressPercentage() == null ? 0 : e.getProgressPercentage();
            watchMinutes += e.getTotalWatchTimeMinutes() == null ? 0 : e.getTotalWatchTimeMinutes();
        }

        Map<String, Object> statistics = new LinkedHashMap<>();
        statistics.put("total_enrollments", enrollments.size());
        statistics.put("completed_courses", completedCount);
        statistics.put("average_progress", enrollments.isEmpty() ? 0
                : Math.round((progressSum / enrollments.size()) * 100.0) / 100.0);
        statistics.put("total_watch_time_minutes", watchMinutes);
        statistics.put("wishlist_count", wishlistRepository.findByUserId(userId).size());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("enrollments", list);
        data.put("statistics", statistics);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        return response;
    }

    @Transactional
    public Map<String, Object> updateVideoProgress(Long userId, Map<String, Object> body) {
        Long videoId = asLong(body.get("videoId"));
        if (videoId == null) throw ApiException.badRequest("videoId is required");
        CourseVideo video = videoRepository.findById(videoId)
                .orElseThrow(() -> ApiException.notFound("Video not found"));

        boolean completed = body.containsKey("isCompleted") ? asBool(body.get("isCompleted")) : true;
        int watch = asInt(body.get("watchTimeSeconds"), 0);
        int lastPos = asInt(body.get("lastPositionSeconds"), 0);

        UserVideoProgress p = videoProgressRepository.findByUserIdAndVideoId(userId, videoId)
                .orElseGet(() -> {
                    UserVideoProgress np = new UserVideoProgress();
                    np.setUserId(userId);
                    np.setVideoId(videoId);
                    return np;
                });
        p.setWatchTimeSeconds(Math.max(p.getWatchTimeSeconds() == null ? 0 : p.getWatchTimeSeconds(), watch));
        if (lastPos > 0) p.setLastPositionSeconds(lastPos);
        if (completed && !p.isCompleted()) {
            p.setCompleted(true);
            p.setCompletedAt(Instant.now());
        }
        p.setUpdatedAt(Instant.now());
        videoProgressRepository.save(p);

        progressService.recomputeModuleCompletion(userId, video.getCourseId(), video.getSectionId());
        double pct = progressService.recomputeCourseProgress(userId, video.getCourseId());
        goalService.onLearningActivity(userId, Math.max(0, watch / 60));
        return progressResult(pct, completed);
    }

    @Transactional
    public Map<String, Object> updateResourceProgress(Long userId, Map<String, Object> body) {
        Long resourceId = asLong(body.get("resourceId"));
        if (resourceId == null) throw ApiException.badRequest("resourceId is required");
        CourseResource r = courseResourceRepository.findById(resourceId)
                .orElseThrow(() -> ApiException.notFound("Resource not found"));

        boolean completed = body.containsKey("isCompleted") ? asBool(body.get("isCompleted")) : true;
        ResourceProgress p = resourceProgressRepository.findByUserIdAndResourceId(userId, resourceId)
                .orElseGet(() -> {
                    ResourceProgress np = new ResourceProgress();
                    np.setUserId(userId);
                    np.setResourceId(resourceId);
                    return np;
                });
        if (completed && !p.isCompleted()) {
            p.setCompleted(true);
            p.setCompletedAt(Instant.now());
        }
        p.setUpdatedAt(Instant.now());
        resourceProgressRepository.save(p);

        progressService.recomputeModuleCompletion(userId, r.getCourseId(), r.getSectionId());
        double pct = progressService.recomputeCourseProgress(userId, r.getCourseId());
        goalService.onLearningActivity(userId, completed ? Math.max(1, r.getEstimatedReadMinutes() == null ? 1 : r.getEstimatedReadMinutes()) : 0);
        return progressResult(pct, completed);
    }

    @Transactional
    public Map<String, Object> completeCourse(Long userId, Long courseId) {
        CourseEnrollment e = enrollmentRepository.findByUserIdAndCourseId(userId, courseId)
                .orElseThrow(() -> ApiException.badRequest("Not enrolled in this course"));
        boolean wasAlreadyComplete = e.isCompleted();
        e.setCompleted(true);
        e.setProgressPercentage(100.0);
        if (e.getCompletionDate() == null) e.setCompletionDate(Instant.now());
        e.setUpdatedAt(Instant.now());
        enrollmentRepository.save(e);

        if (!wasAlreadyComplete) {
            certificateService.issueForCompletion(userId, courseId);
            String title = courseRepository.findById(courseId).map(Course::getTitle).orElse("your course");
            pushNotificationService.notifyLearningEvent(userId, "Course completed",
                    "Congratulations! You completed \"" + title + "\" and earned a certificate.");
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("is_completed", true);
        data.put("course_id", String.valueOf(courseId));
        return data;
    }

    // ---- wishlist -------------------------------------------------------

    public List<Map<String, Object>> getWishlist(Long userId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CourseWishlist w : wishlistRepository.findByUserId(userId)) {
            courseRepository.findById(w.getCourseId()).ifPresent(c -> {
                Map<String, Object> m = courseService.courseSummaryMap(c);
                m.put("is_in_wishlist", true);
                out.add(m);
            });
        }
        return out;
    }

    @Transactional
    public void addToWishlist(Long userId, Long courseId) {
        if (!courseRepository.existsById(courseId)) throw ApiException.notFound("Course not found");
        if (wishlistRepository.existsByUserIdAndCourseId(userId, courseId)) return;
        CourseWishlist w = new CourseWishlist();
        w.setUserId(userId);
        w.setCourseId(courseId);
        wishlistRepository.save(w);
    }

    @Transactional
    public void removeFromWishlist(Long userId, Long courseId) {
        wishlistRepository.deleteByUserIdAndCourseId(userId, courseId);
    }

    // ---- helpers --------------------------------------------------------

    private Map<String, Object> progressResult(double pct, boolean completed) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("progress_percentage", pct);
        data.put("is_completed", completed);
        return data;
    }

    private Long asLong(Object v) {
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int asInt(Object v, int def) {
        if (v == null) return def;
        try {
            return (int) Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private boolean asBool(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v).trim());
    }
}
