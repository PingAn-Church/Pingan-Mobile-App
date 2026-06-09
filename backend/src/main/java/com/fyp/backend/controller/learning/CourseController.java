package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.service.CourseService;

/**
 * Learner-facing catalog read endpoints. Mirrors the source Supabase edge
 * function names under /api/fn so the ported mobile services work unchanged.
 */
@RestController
@RequestMapping("/api/fn")
public class CourseController {

    @Autowired
    private CourseService courseService;

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

    @GetMapping("/getModuleDetail/{courseId}")
    public Map<String, Object> getModuleDetail(@PathVariable Long courseId) {
        return courseService.getModuleDetail(courseId);
    }

    @GetMapping("/getVideoDetail/{videoId}")
    public Map<String, Object> getVideoDetail(@PathVariable Long videoId) {
        return courseService.getVideoDetail(videoId);
    }
}
