package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.service.QuizService;
import com.fyp.backend.service.UserService;

/**
 * Manual short-answer grading for instructors (P6). The queue is scoped to
 * courses the requesting instructor owns; admins see every course.
 */
@RestController
@RequestMapping("/api/fn")
@PreAuthorize("hasRole('INSTRUCTOR')")
public class GradingController {

    @Autowired
    private QuizService quizService;

    @Autowired
    private UserService userService;

    @GetMapping("/getPendingGrading")
    @SuppressWarnings("unchecked")
    public ApiResponse<List<Map<String, Object>>> getPendingGrading(
            @RequestHeader("Authorization") String auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long courseId) {
        User requester = userService.getUserFromToken(auth)
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        Map<String, Object> result = quizService.pendingGrading(requester, page, size, courseId);
        return ApiResponse.ok((List<Map<String, Object>>) result.get("data"), result.get("pagination"));
    }

    @PostMapping("/gradeShortAnswer")
    public ApiResponse<Map<String, Object>> gradeShortAnswer(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        User grader = userService.getUserFromToken(auth)
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        return ApiResponse.ok("Answer graded", quizService.gradeShortAnswer(grader, body));
    }
}
