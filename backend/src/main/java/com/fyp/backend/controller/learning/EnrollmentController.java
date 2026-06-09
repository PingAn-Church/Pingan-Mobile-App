package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.EnrollmentService;
import com.fyp.backend.service.UserService;

/**
 * Enrollment, progress, completion and wishlist. The acting user is taken from
 * the JWT (not a path param) so a user can only affect their own records.
 */
@RestController
@RequestMapping("/api/fn")
public class EnrollmentController {

    @Autowired private EnrollmentService enrollmentService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    @PostMapping("/postUserEnrollment")
    public ApiResponse<Map<String, Object>> enroll(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long courseId = parseLong(body.get("courseId"));
        if (courseId == null) throw ApiException.badRequest("courseId is required");
        return ApiResponse.ok("Enrolled", enrollmentService.enroll(currentUserId(auth), courseId));
    }

    @GetMapping("/getUserEnrollment")
    public Map<String, Object> getUserEnrollment(@RequestHeader("Authorization") String auth) {
        return enrollmentService.getUserEnrollment(currentUserId(auth));
    }

    @GetMapping("/isEnrolled/{courseId}")
    public ApiResponse<Map<String, Object>> isEnrolled(@RequestHeader("Authorization") String auth,
            @PathVariable Long courseId) {
        boolean enrolled = enrollmentService.isEnrolled(currentUserId(auth), courseId);
        return ApiResponse.ok(Map.of("enrolled", enrolled));
    }

    @PostMapping("/updateVideoProgress")
    public ApiResponse<Map<String, Object>> updateVideoProgress(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Progress updated", enrollmentService.updateVideoProgress(currentUserId(auth), body));
    }

    @PostMapping("/updatePDFProgress")
    public ApiResponse<Map<String, Object>> updatePdfProgress(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Progress updated", enrollmentService.updateResourceProgress(currentUserId(auth), body));
    }

    @PostMapping("/completeCourse")
    public ApiResponse<Map<String, Object>> completeCourse(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long courseId = parseLong(body.get("courseId"));
        if (courseId == null) throw ApiException.badRequest("courseId is required");
        return ApiResponse.ok("Course completed", enrollmentService.completeCourse(currentUserId(auth), courseId));
    }

    // ---- wishlist -------------------------------------------------------

    @GetMapping("/wishlistHandler")
    public ApiResponse<List<Map<String, Object>>> getWishlist(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(enrollmentService.getWishlist(currentUserId(auth)));
    }

    @PostMapping("/wishlistHandler")
    public ApiResponse<Object> addWishlist(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long courseId = parseLong(body.get("courseId"));
        if (courseId == null) throw ApiException.badRequest("courseId is required");
        enrollmentService.addToWishlist(currentUserId(auth), courseId);
        return ApiResponse.ok("Added to wishlist", null);
    }

    @DeleteMapping("/wishlistHandler")
    public ApiResponse<Object> removeWishlist(@RequestHeader("Authorization") String auth,
            @RequestParam Long courseId) {
        enrollmentService.removeFromWishlist(currentUserId(auth), courseId);
        return ApiResponse.ok("Removed from wishlist", null);
    }

    private Long parseLong(Object v) {
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
