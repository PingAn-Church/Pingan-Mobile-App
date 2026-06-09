package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.QuizService;
import com.fyp.backend.service.UserService;

@RestController
@RequestMapping("/api/fn")
public class QuizController {

    @Autowired private QuizService quizService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    @GetMapping("/getQuizDetail/{quizId}")
    public Map<String, Object> getQuizDetail(@RequestHeader("Authorization") String auth,
            @PathVariable Long quizId) {
        return quizService.getQuizDetail(quizId, currentUserId(auth));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/submitQuiz/{quizId}")
    public Map<String, Object> submitQuiz(@RequestHeader("Authorization") String auth,
            @PathVariable Long quizId, @RequestBody Map<String, Object> body) {
        Object raw = body.get("answers");
        List<Map<String, Object>> answers = raw instanceof List<?> list
                ? (List<Map<String, Object>>) (List<?>) list
                : List.of();
        Integer timeTaken = body.get("timeTakenMinutes") == null ? null
                : (int) Double.parseDouble(String.valueOf(body.get("timeTakenMinutes")));
        return quizService.submitQuiz(currentUserId(auth), quizId, answers, timeTaken);
    }

    @GetMapping("/getQuizResults/{quizId}")
    public Map<String, Object> getQuizResults(@RequestHeader("Authorization") String auth,
            @PathVariable Long quizId) {
        return quizService.getQuizResults(quizId, currentUserId(auth));
    }
}
