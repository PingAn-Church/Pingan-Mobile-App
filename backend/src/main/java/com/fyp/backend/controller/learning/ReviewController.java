package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.ReviewService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.Pagination;

@RestController
@RequestMapping("/api/fn")
public class ReviewController {

    @Autowired private ReviewService reviewService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    /** The current user's review for a course (or null). */
    @GetMapping("/courseReviewHandler/{courseId}")
    public ApiResponse<Map<String, Object>> getMyReview(@RequestHeader("Authorization") String auth,
            @PathVariable Long courseId) {
        return ApiResponse.ok(reviewService.getUserReview(courseId, currentUserId(auth)));
    }

    @PostMapping("/courseReviewHandler/{courseId}")
    public ApiResponse<Map<String, Object>> postReview(@RequestHeader("Authorization") String auth,
            @PathVariable Long courseId, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Review submitted",
                reviewService.postReview(courseId, currentUserId(auth), rating(body), review(body), anonymous(body)));
    }

    @PutMapping("/courseReviewHandler/{courseId}")
    public ApiResponse<Map<String, Object>> updateReview(@RequestHeader("Authorization") String auth,
            @PathVariable Long courseId, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Review updated",
                reviewService.updateReview(courseId, currentUserId(auth), rating(body), review(body), anonymous(body)));
    }

    /** All visible reviews for a course. */
    @GetMapping("/getCourseReviews/{courseId}")
    @SuppressWarnings("unchecked")
    public ApiResponse<List<Map<String, Object>>> listReviews(
            @PathVariable Long courseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Sort sort = Sort.by(
                Sort.Order.desc("isPinned"),
                Sort.Order.desc("createdAt"),
                Sort.Order.desc("id"));
        Map<String, Object> result = reviewService.listReviews(
                courseId, PageRequest.of(Pagination.clampPage(page), Pagination.clampSize(size), sort));
        return ApiResponse.ok((List<Map<String, Object>>) result.get("data"), result.get("pagination"));
    }

    private int rating(Map<String, Object> body) {
        try {
            return (int) Double.parseDouble(String.valueOf(body.get("rating")));
        } catch (Exception e) {
            return 0;
        }
    }

    private String review(Map<String, Object> body) {
        Object v = body.get("review");
        return v == null ? "" : String.valueOf(v);
    }

    private boolean anonymous(Map<String, Object> body) {
        Object v = body.get("isAnonymous");
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v));
    }
}
