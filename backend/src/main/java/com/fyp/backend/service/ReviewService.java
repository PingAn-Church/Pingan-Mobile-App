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
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.UserRepository;

@Service
public class ReviewService {

    @Autowired private CourseRatingRepository ratingRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private UserRepository userRepository;

    public Map<String, Object> getUserReview(Long courseId, Long userId) {
        return ratingRepository.findByCourseIdAndUserId(courseId, userId)
                .map(this::reviewMap).orElse(null);
    }

    public List<Map<String, Object>> listReviews(Long courseId) {
        List<CourseRating> ratings = new ArrayList<>(
                ratingRepository.findByCourseIdAndReviewStatus(courseId, "visible"));
        // Pinned first, then newest first.
        ratings.sort(Comparator
                .comparing(CourseRating::isPinned).reversed()
                .thenComparing(Comparator.comparing(CourseRating::getCreatedAt,
                        Comparator.nullsFirst(Comparator.naturalOrder())).reversed()));
        List<Map<String, Object>> out = new ArrayList<>();
        for (CourseRating r : ratings) out.add(reviewMap(r));
        return out;
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
        r.setReview(review.trim());
        r.setAnonymous(anonymous);
        r = ratingRepository.save(r);
        recomputeCourseRating(courseId);
        return reviewMap(r);
    }

    @Transactional
    public Map<String, Object> updateReview(Long courseId, Long userId, int rating, String review, boolean anonymous) {
        validate(rating, review);
        CourseRating r = ratingRepository.findByCourseIdAndUserId(courseId, userId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        r.setRating(rating);
        r.setReview(review.trim());
        r.setAnonymous(anonymous);
        r.setUpdatedAt(Instant.now());
        ratingRepository.save(r);
        recomputeCourseRating(courseId);
        return reviewMap(r);
    }

    private void recomputeCourseRating(Long courseId) {
        List<CourseRating> visible = ratingRepository.findByCourseIdAndReviewStatus(courseId, "visible");
        Course course = courseRepository.findById(courseId).orElse(null);
        if (course == null) return;
        if (visible.isEmpty()) {
            course.setRating(0.0);
            course.setTotalRatings(0);
        } else {
            double avg = visible.stream().mapToInt(CourseRating::getRating).average().orElse(0);
            course.setRating(Math.round(avg * 100.0) / 100.0);
            course.setTotalRatings(visible.size());
        }
        courseRepository.save(course);
    }

    private void validate(int rating, String review) {
        if (rating < 1 || rating > 5) throw ApiException.badRequest("rating must be 1-5");
        if (review == null || review.isBlank()) throw ApiException.badRequest("review text is required");
    }

    private Map<String, Object> reviewMap(CourseRating r) {
        String name = "Anonymous";
        String avatar = null;
        if (!r.isAnonymous()) {
            User u = userRepository.findById(r.getUserId()).orElse(null);
            if (u != null) {
                String full = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                        + (u.getLastName() == null ? "" : u.getLastName())).trim();
                name = full.isEmpty() ? (u.getEmail() == null ? "User" : u.getEmail()) : full;
                avatar = u.getProfileImage();
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(r.getId()));
        m.put("rating", r.getRating());
        m.put("review", r.getReview());
        m.put("isAnonymous", r.isAnonymous());
        m.put("reviewerName", name);
        m.put("reviewerAvatar", avatar);
        m.put("createdAt", r.getCreatedAt());
        m.put("instructorReply", r.getInstructorReply());
        return m;
    }
}
