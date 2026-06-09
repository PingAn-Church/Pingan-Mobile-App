package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.service.AuthoringService;
import com.fyp.backend.service.UserService;

/**
 * Instructor/admin authoring endpoints for the in-app course-management portal.
 * All require the INSTRUCTOR role (admins hold it inclusively).
 */
@RestController
@RequestMapping("/api/fn")
@PreAuthorize("hasRole('INSTRUCTOR')")
public class AuthoringController {

    @Autowired
    private AuthoringService authoringService;

    @Autowired
    private UserService userService;

    // ---- courses --------------------------------------------------------

    @PostMapping("/createCourse")
    public ApiResponse<Map<String, Object>> createCourse(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        User author = userService.getUserFromToken(auth)
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        return ApiResponse.ok("Course created", authoringService.createCourse(author, body));
    }

    @PutMapping("/updateCourse/{courseId}")
    public ApiResponse<Map<String, Object>> updateCourse(@PathVariable Long courseId,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Course updated", authoringService.updateCourse(courseId, body));
    }

    @DeleteMapping("/deleteCourse/{courseId}")
    public ApiResponse<Object> deleteCourse(@PathVariable Long courseId) {
        authoringService.deleteCourse(courseId);
        return ApiResponse.ok("Course deleted", null);
    }

    @PutMapping("/setCourseOutcomes/{courseId}")
    @SuppressWarnings("unchecked")
    public ApiResponse<Object> setCourseOutcomes(@PathVariable Long courseId,
            @RequestBody Map<String, Object> body) {
        Object raw = body.get("outcomes");
        List<String> outcomes = raw instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
        authoringService.setOutcomes(courseId, outcomes);
        return ApiResponse.ok("Outcomes updated", null);
    }

    // ---- categories -----------------------------------------------------

    @PostMapping("/categoryHandler")
    public ApiResponse<Map<String, Object>> createCategory(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Category created", authoringService.createCategory(body));
    }

    @PutMapping("/categoryHandler/{id}")
    public ApiResponse<Map<String, Object>> updateCategory(@PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Category updated", authoringService.updateCategory(id, body));
    }

    @DeleteMapping("/categoryHandler/{id}")
    public ApiResponse<Object> deleteCategory(@PathVariable Long id) {
        authoringService.deleteCategory(id);
        return ApiResponse.ok("Category deleted", null);
    }

    // ---- sections -------------------------------------------------------

    @PostMapping("/createSection")
    public ApiResponse<Map<String, Object>> createSection(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Section created", authoringService.createSection(body));
    }

    @PutMapping("/updateSection/{id}")
    public ApiResponse<Map<String, Object>> updateSection(@PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Section updated", authoringService.updateSection(id, body));
    }

    @DeleteMapping("/deleteSection/{id}")
    public ApiResponse<Object> deleteSection(@PathVariable Long id) {
        authoringService.deleteSection(id);
        return ApiResponse.ok("Section deleted", null);
    }

    // ---- videos ---------------------------------------------------------

    @PostMapping("/createVideo")
    public ApiResponse<Map<String, Object>> createVideo(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Video created", authoringService.createVideo(body));
    }

    @PutMapping("/updateVideo/{id}")
    public ApiResponse<Map<String, Object>> updateVideo(@PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Video updated", authoringService.updateVideo(id, body));
    }

    @DeleteMapping("/deleteVideo/{id}")
    public ApiResponse<Object> deleteVideo(@PathVariable Long id) {
        authoringService.deleteVideo(id);
        return ApiResponse.ok("Video deleted", null);
    }

    // ---- resources ------------------------------------------------------

    @PostMapping("/createResource")
    public ApiResponse<Map<String, Object>> createResource(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Resource created", authoringService.createResource(body));
    }

    @PutMapping("/updateResource/{id}")
    public ApiResponse<Map<String, Object>> updateResource(@PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Resource updated", authoringService.updateResource(id, body));
    }

    @DeleteMapping("/deleteResource/{id}")
    public ApiResponse<Object> deleteResource(@PathVariable Long id) {
        authoringService.deleteResource(id);
        return ApiResponse.ok("Resource deleted", null);
    }
}
