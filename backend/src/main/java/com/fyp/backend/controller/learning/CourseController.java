package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.service.CourseService;
import com.fyp.backend.service.UserService;

/**
 * Learner-facing catalog read endpoints. Mirrors the source Supabase edge
 * function names under /api/fn so the ported mobile services work unchanged.
 */
@RestController
@RequestMapping("/api/fn")
public class CourseController {

    @Autowired
    private CourseService courseService;

    @Autowired
    private UserService userService;

    @GetMapping("/getAllPublishedCourse")
    public Map<String, Object> getAllPublishedCourse(
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "24") int limit,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "updated_at") String sortBy,
            @RequestParam(defaultValue = "desc") String sortOrder) {
        return courseService.listPublishedCourses(category, limit, offset, sortBy, sortOrder);
    }

    @GetMapping("/categoryHandler")
    public ApiResponse<List<Map<String, Object>>> categoryHandler() {
        return ApiResponse.ok(courseService.listCategories());
    }

    /** Management list (published + drafts) for the authoring portal. */
    @PreAuthorize("hasRole('INSTRUCTOR')")
    @GetMapping("/getAllCourse")
    public ApiResponse<List<Map<String, Object>>> getAllCourse() {
        return ApiResponse.ok(courseService.listAllCourses());
    }

    @GetMapping("/getModuleDetail/{courseId}")
    public Map<String, Object> getModuleDetail(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long courseId) {
        Long userId = userService.getUserIdFromToken(auth);
        return courseService.getModuleDetail(courseId, userId);
    }

    @GetMapping("/getVideoDetail/{videoId}")
    public Map<String, Object> getVideoDetail(@PathVariable Long videoId) {
        return courseService.getVideoDetail(videoId);
    }
}
