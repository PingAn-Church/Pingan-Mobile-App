package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Category;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseOutcome;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.CourseResource;
import com.fyp.backend.model.CourseSection;
import com.fyp.backend.model.CourseVideo;
import com.fyp.backend.model.QuizAttempt;
import com.fyp.backend.model.ResourceProgress;
import com.fyp.backend.model.UserVideoProgress;
import com.fyp.backend.repository.CategoryRepository;
import com.fyp.backend.repository.CourseOutcomeRepository;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseResourceRepository;
import com.fyp.backend.repository.CourseSectionRepository;
import com.fyp.backend.repository.CourseVideoRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Read-side catalog logic (P2). Returns loosely-typed maps matching the JSON
 * shapes the ported mobile course services consume.
 */
@Service
public class CourseService {

    @Autowired private CourseRepository courseRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private CourseSectionRepository sectionRepository;
    @Autowired private CourseVideoRepository videoRepository;
    @Autowired private CourseResourceRepository resourceRepository;
    @Autowired private CourseOutcomeRepository outcomeRepository;
    @Autowired private CourseQuizRepository quizRepository;
    @Autowired private CourseRatingRepository ratingRepository;
    @Autowired private CourseWishlistRepository wishlistRepository;
    @Autowired private UserVideoProgressRepository videoProgressRepository;
    @Autowired private ResourceProgressRepository resourceProgressRepository;
    @Autowired private QuizAttemptRepository quizAttemptRepository;

    public List<Map<String, Object>> listCategories() {
        return categoryRepository.findAll().stream()
                .sorted(Comparator.comparing(Category::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::categoryMap)
                .collect(Collectors.toList());
    }

    /** All courses (published or not) for the authoring/management list. */
    public List<Map<String, Object>> listAllCourses() {
        List<Course> courses = courseRepository.findAll();
        courses.sort(courseComparator("updated_at").reversed());
        return courses.stream().map(this::courseSummaryMap).collect(Collectors.toList());
    }

    public Map<String, Object> listPublishedCourses(String category, int limit, int offset,
            String sortBy, String sortOrder) {
        // Push paging + ordering into SQL instead of reading the whole table and slicing.
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        int safeOffset = Math.max(0, offset);
        int page = safeLimit > 0 ? safeOffset / safeLimit : 0;

        Sort.Direction dir = "asc".equalsIgnoreCase(sortOrder) ? Sort.Direction.ASC : Sort.Direction.DESC;
        // Stable ordering with an id tiebreaker so pages don't drift/duplicate.
        Sort sort = Sort.by(dir, sortPropertyFor(sortBy)).and(Sort.by(Sort.Direction.DESC, "id"));
        Pageable pageable = PageRequest.of(page, safeLimit, sort);

        Page<Course> result;
        if (category != null && !category.isBlank()) {
            Optional<Category> cat = categoryRepository.findByNameIgnoreCase(category.trim());
            result = cat.map(c -> courseRepository.findByIsPublishedTrueAndCategoryId(c.getId(), pageable))
                    .orElseGet(() -> Page.empty(pageable));
        } else {
            result = courseRepository.findByIsPublishedTrue(pageable);
        }

        List<Map<String, Object>> data = result.getContent().stream()
                .map(this::courseSummaryMap).collect(Collectors.toList());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("limit", safeLimit);
        pagination.put("offset", safeOffset);
        pagination.put("totalCount", result.getTotalElements());
        pagination.put("hasMore", result.hasNext());
        response.put("pagination", pagination);
        return response;
    }

    /** Maps the public sortBy key to a Course entity property for DB-side sorting. */
    private String sortPropertyFor(String sortBy) {
        String key = sortBy == null ? "updated_at" : sortBy;
        switch (key) {
            case "rating":
                return "rating";
            case "student_count":
                return "studentCount";
            case "created_at":
                return "createdAt";
            case "updated_at":
            default:
                return "updatedAt";
        }
    }

    public Map<String, Object> getModuleDetail(Long courseId, Long userId) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));

        Map<String, Object> data = courseSummaryMap(course);
        data.put("is_in_wishlist",
                userId != null && wishlistRepository.existsByUserIdAndCourseId(userId, courseId));

        List<String> outcomes = outcomeRepository.findByCourseIdOrderByOrderIndexAsc(courseId).stream()
                .map(CourseOutcome::getOutcome).collect(Collectors.toList());
        data.put("outcomes", outcomes);

        List<CourseSection> sections = sectionRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        List<Map<String, Object>> modules = new ArrayList<>();
        for (CourseSection section : sections) {
            Map<String, Object> module = new LinkedHashMap<>();
            module.put("id", String.valueOf(section.getId()));
            module.put("title", section.getTitle());
            module.put("description", section.getDescription());
            module.put("order_index", section.getOrderIndex());

            List<Map<String, Object>> videos = videoRepository
                    .findBySectionIdOrderByOrderIndexAsc(section.getId()).stream()
                    .map(this::videoMap).collect(Collectors.toList());
            List<Map<String, Object>> resources = resourceRepository
                    .findBySectionIdOrderByOrderIndexAsc(section.getId()).stream()
                    .map(this::resourceMap).collect(Collectors.toList());
            List<Map<String, Object>> quizzes = quizRepository
                    .findBySectionIdOrderByOrderIndexAsc(section.getId()).stream()
                    .map(this::quizLessonMap).collect(Collectors.toList());

            // Per-user completion flags so the app can show "Completed" instead of
            // an always-on "Mark as complete" button (lessons share these refs).
            markVideoCompletion(videos, userId);
            markResourceCompletion(resources, userId);
            markQuizResults(quizzes, userId);

            List<Map<String, Object>> lessons = new ArrayList<>();
            lessons.addAll(videos);
            lessons.addAll(resources);
            lessons.addAll(quizzes);

            module.put("videos", videos);
            module.put("resources", resources);
            module.put("quizzes", quizzes);
            module.put("lessons", lessons);
            modules.add(module);
        }
        data.put("modules", modules);
        data.put("total_resources", resourceRepository.countByCourseId(courseId));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        return response;
    }

    private void markVideoCompletion(List<Map<String, Object>> videos, Long userId) {
        if (videos.isEmpty()) return;
        Set<Long> done = Set.of();
        if (userId != null) {
            List<Long> ids = videos.stream()
                    .map(v -> Long.valueOf((String) v.get("id"))).collect(Collectors.toList());
            done = videoProgressRepository.findByUserIdAndVideoIdIn(userId, ids).stream()
                    .filter(UserVideoProgress::isCompleted)
                    .map(UserVideoProgress::getVideoId)
                    .collect(Collectors.toSet());
        }
        final Set<Long> completed = done;
        videos.forEach(v -> v.put("is_completed", completed.contains(Long.valueOf((String) v.get("id")))));
    }

    private void markResourceCompletion(List<Map<String, Object>> resources, Long userId) {
        if (resources.isEmpty()) return;
        Set<Long> done = Set.of();
        if (userId != null) {
            List<Long> ids = resources.stream()
                    .map(r -> Long.valueOf((String) r.get("id"))).collect(Collectors.toList());
            done = resourceProgressRepository.findByUserIdAndResourceIdIn(userId, ids).stream()
                    .filter(ResourceProgress::isCompleted)
                    .map(ResourceProgress::getResourceId)
                    .collect(Collectors.toSet());
        }
        final Set<Long> completed = done;
        resources.forEach(r -> r.put("is_completed", completed.contains(Long.valueOf((String) r.get("id")))));
    }

    /**
     * Annotate quiz lessons with the user's result so the app can show actual
     * marks ("85%") rather than a bare "completed" tick. Reports the best score
     * across graded attempts; "grades_released=false" means an attempt is still
     * awaiting the instructor's short-answer review (show "Pending review").
     */
    private void markQuizResults(List<Map<String, Object>> quizzes, Long userId) {
        if (quizzes.isEmpty()) return;
        Map<Long, List<QuizAttempt>> byQuiz = Map.of();
        if (userId != null) {
            List<Long> ids = quizzes.stream()
                    .map(q -> Long.valueOf((String) q.get("id"))).collect(Collectors.toList());
            byQuiz = quizAttemptRepository.findByUserIdAndQuizIdIn(userId, ids).stream()
                    .collect(Collectors.groupingBy(QuizAttempt::getQuizId));
        }
        final Map<Long, List<QuizAttempt>> attemptsByQuiz = byQuiz;
        quizzes.forEach(q -> {
            Long qid = Long.valueOf((String) q.get("id"));
            List<QuizAttempt> attempts = attemptsByQuiz.getOrDefault(qid, List.of());
            List<QuizAttempt> released = attempts.stream()
                    .filter(QuizAttempt::isGradesReleased).collect(Collectors.toList());
            int bestScore = released.stream()
                    .mapToInt(a -> a.getScore() == null ? 0 : a.getScore()).max().orElse(0);
            q.put("attempted", !attempts.isEmpty());
            q.put("grades_released", !attempts.isEmpty() && !released.isEmpty());
            q.put("score", bestScore);
            q.put("is_passed", released.stream().anyMatch(QuizAttempt::isPassed));
        });
    }

    public Map<String, Object> getVideoDetail(Long videoId) {
        CourseVideo video = videoRepository.findById(videoId)
                .orElseThrow(() -> ApiException.notFound("Video not found"));
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", videoMap(video));
        return response;
    }

    // ---- mappers --------------------------------------------------------

    private Comparator<Course> courseComparator(String sortBy) {
        String key = sortBy == null ? "updated_at" : sortBy;
        switch (key) {
            case "rating":
                return Comparator.comparing(c -> c.getRating() == null ? 0.0 : c.getRating());
            case "student_count":
                return Comparator.comparing(c -> c.getStudentCount() == null ? 0 : c.getStudentCount());
            case "created_at":
                return Comparator.comparing(Course::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder()));
            case "updated_at":
            default:
                return Comparator.comparing(Course::getUpdatedAt, Comparator.nullsFirst(Comparator.naturalOrder()));
        }
    }

    private Map<String, Object> categoryMap(Category c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(c.getId()));
        m.put("name", c.getName());
        m.put("color", c.getColor());
        m.put("course_count", courseRepository.countByCategoryId(c.getId()));
        m.put("created_at", c.getCreatedAt());
        return m;
    }

    public Map<String, Object> courseSummaryMap(Course course) {
        Category category = course.getCategoryId() == null ? null
                : categoryRepository.findById(course.getCategoryId()).orElse(null);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(course.getId()));
        m.put("title", course.getTitle());
        m.put("description", course.getDescription());
        m.put("instructor_name", course.getInstructorName());
        m.put("instructor_id", course.getInstructorId() == null ? null : String.valueOf(course.getInstructorId()));
        m.put("category_id", course.getCategoryId() == null ? null : String.valueOf(course.getCategoryId()));
        m.put("category_name", category != null ? category.getName() : "General");
        m.put("category_color", category != null ? category.getColor() : null);
        m.put("duration_hours", course.getDurationHours());
        m.put("rating", course.getRating());
        m.put("total_ratings", course.getTotalRatings());
        m.put("thumbnail_url", course.getThumbnailUrl());
        m.put("tags", splitTags(course.getTags()));
        m.put("student_count", course.getStudentCount());
        m.put("is_published", course.isPublished());
        m.put("total_sections", sectionRepository.countByCourseId(course.getId()));
        m.put("total_videos", videoRepository.countByCourseId(course.getId()));
        m.put("total_quizzes", quizRepository.countByCourseId(course.getId()));
        m.put("created_at", course.getCreatedAt());
        m.put("updated_at", course.getUpdatedAt());
        return m;
    }

    private Map<String, Object> videoMap(CourseVideo v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(v.getId()));
        m.put("type", "video");
        m.put("course_id", String.valueOf(v.getCourseId()));
        m.put("section_id", v.getSectionId() == null ? null : String.valueOf(v.getSectionId()));
        m.put("title", v.getTitle());
        m.put("description", v.getDescription());
        m.put("video_url", v.getVideoUrl());
        m.put("duration_seconds", v.getDurationSeconds());
        m.put("thumbnail_url", v.getThumbnailUrl());
        m.put("is_preview", v.isPreview());
        m.put("order_index", v.getOrderIndex());
        return m;
    }

    private Map<String, Object> quizLessonMap(CourseQuiz q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(q.getId()));
        m.put("type", "quiz");
        m.put("course_id", String.valueOf(q.getCourseId()));
        m.put("section_id", q.getSectionId() == null ? null : String.valueOf(q.getSectionId()));
        m.put("title", q.getTitle());
        m.put("description", q.getDescription());
        m.put("passing_score", q.getPassingScore());
        m.put("max_attempts", q.getMaxAttempts());
        m.put("order_index", q.getOrderIndex());
        return m;
    }

    private Map<String, Object> resourceMap(CourseResource r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(r.getId()));
        m.put("type", "resource");
        m.put("course_id", String.valueOf(r.getCourseId()));
        m.put("section_id", r.getSectionId() == null ? null : String.valueOf(r.getSectionId()));
        m.put("title", r.getTitle());
        m.put("description", r.getDescription());
        m.put("resource_url", r.getResourceUrl());
        m.put("resource_type", r.getResourceType());
        m.put("file_size_bytes", r.getFileSizeBytes());
        m.put("estimated_read_minutes", r.getEstimatedReadMinutes());
        m.put("is_downloadable", r.isDownloadable());
        m.put("is_preview", r.isPreview());
        m.put("order_index", r.getOrderIndex());
        return m;
    }

    private List<String> splitTags(String tags) {
        if (tags == null || tags.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        for (String t : tags.split(",")) {
            String trimmed = t.trim();
            if (!trimmed.isEmpty()) out.add(trimmed);
        }
        return out;
    }

    // Reusable internal helpers for other services / phases.
    public Course requireCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }

    public boolean exists(Long courseId) {
        return courseRepository.existsById(courseId);
    }
}
