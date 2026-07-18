package com.fyp.backend.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.exception.ContentUnderReviewException;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.Pagination;

@Service
public class ReviewService {

    @Autowired private CourseRatingRepository ratingRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ContentSanitizer contentSanitizer;

    public Map<String, Object> getUserReview(Long courseId, Long userId) {
        return ratingRepository.findByCourseIdAndUserId(courseId, userId)
                .map(r -> reviewMap(r, null, userRepository.findById(userId).orElse(null)))
                .orElse(null);
    }

    /**
     * Visible + flagged reviews for a course. Flagged (reported, pending admin
     * review) reviews stay in the list so clients can render a "Reported,
     * pending review" placeholder — except to their own author (isOwn), who
     * keeps seeing the original. requesterId is null for guests.
     */
    public Map<String, Object> listReviews(Long courseId, User requester, Pageable pageable) {
        Page<CourseRating> result = ratingRepository.findByCourseIdAndReviewStatusIn(
                courseId, List.of("visible", "flagged"), pageable);
        List<Long> userIds = result.getContent().stream()
                .filter(r -> !r.isAnonymous())
                .map(CourseRating::getUserId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, User> users = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
        List<Map<String, Object>> data = result.getContent().stream()
                .map(r -> reviewMap(r, users.get(r.getUserId()), requester))
                .collect(Collectors.toList());
        return Pagination.envelope(data, result);
    }

    @Transactional
    public Map<String, Object> postReview(Long courseId, Long userId, int rating, String review, boolean anonymous) {
        validate(rating, review);
        courseRepository.findById(courseId).orElseThrow(() -> ApiException.notFound("Course not found"));
        ratingRepository.findByCourseIdAndUserId(courseId, userId).ifPresent(existing -> {
            throw ApiException.conflict("You have already reviewed this course");
        });
        CourseRating r = new CourseRating();
        r.setCourseId(courseId);
        r.setUserId(userId);
        r.setRating(rating);
        r.setReview(contentSanitizer.mask(review.trim()));
        r.setAnonymous(anonymous);
        r = ratingRepository.save(r);
        recomputeCourseRating(courseId);
        return reviewMap(r, null, userRepository.findById(userId).orElse(null));
    }

    @Transactional
    public Map<String, Object> updateReview(Long courseId, Long userId, int rating, String review, boolean anonymous) {
        validate(rating, review);
        CourseRating r = ratingRepository.findByCourseIdAndUserId(courseId, userId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        if ("flagged".equals(r.getReviewStatus())) {
            throw new ContentUnderReviewException();
        }
        r.setRating(rating);
        r.setReview(contentSanitizer.mask(review.trim()));
        r.setAnonymous(anonymous);
        r.setUpdatedAt(Instant.now());
        ratingRepository.save(r);
        recomputeCourseRating(courseId);
        return reviewMap(r, null, userRepository.findById(userId).orElse(null));
    }

    public void recomputeCourseRating(Long courseId) {
        Course course = courseRepository.findById(courseId).orElse(null);
        if (course == null) return;
        List<Object[]> summaryRows = ratingRepository.visibleRatingSummary(courseId);
        Object[] summary = summaryRows.isEmpty() ? null : summaryRows.get(0);
        double avg = summary != null && summary.length > 0 && summary[0] instanceof Number n ? n.doubleValue() : 0.0;
        long count = summary != null && summary.length > 1 && summary[1] instanceof Number n ? n.longValue() : 0L;
        if (count == 0) {
            course.setRating(0.0);
            course.setTotalRatings(0);
        } else {
            course.setRating(Math.round(avg * 100.0) / 100.0);
            course.setTotalRatings(count > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) count);
        }
        courseRepository.save(course);
    }

    private void validate(int rating, String review) {
        if (rating < 1 || rating > 5) throw ApiException.badRequest("rating must be 1-5");
        if (review == null || review.isBlank()) throw ApiException.badRequest("review text is required");
    }

    private Map<String, Object> reviewMap(CourseRating r, User providedUser, User requester) {
        String name = "Anonymous";
        String avatar = null;
        if (!r.isAnonymous()) {
            User u = providedUser != null ? providedUser : userRepository.findById(r.getUserId()).orElse(null);
            if (u != null) {
                String full = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                        + (u.getLastName() == null ? "" : u.getLastName())).trim();
                name = full.isEmpty() ? (u.getEmail() == null ? "User" : u.getEmail()) : full;
                avatar = u.getProfileImage();
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        boolean isOwn = requester != null && requester.getId().equals(r.getUserId());
        boolean canView = !"flagged".equals(r.getReviewStatus())
                || isOwn
                || (requester != null && requester.isAdmin());
        m.put("id", String.valueOf(r.getId()));
        m.put("rating", canView ? r.getRating() : null);
        m.put("review", canView ? r.getReview() : null);
        m.put("isAnonymous", canView && r.isAnonymous());
        m.put("reviewerName", name);
        m.put("reviewerAvatar", avatar);
        m.put("createdAt", r.getCreatedAt());
        m.put("instructorReply", canView ? r.getInstructorReply() : null);
        m.put("reported", "flagged".equals(r.getReviewStatus()));
        m.put("isOwn", isOwn);
        return m;
    }
}
