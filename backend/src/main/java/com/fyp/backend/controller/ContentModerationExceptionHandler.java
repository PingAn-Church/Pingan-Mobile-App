package com.fyp.backend.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.fyp.backend.exception.ContentUnderReviewException;

@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ContentModerationExceptionHandler {

    @ExceptionHandler(ContentUnderReviewException.class)
    public ResponseEntity<Map<String, String>> handleContentUnderReview(ContentUnderReviewException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", ex.getMessage()));
    }
}
