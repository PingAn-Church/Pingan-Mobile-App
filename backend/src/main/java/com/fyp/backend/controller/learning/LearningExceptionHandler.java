package com.fyp.backend.controller.learning;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;

/**
 * Scoped to the e-learning controllers only, so existing controllers keep their
 * current error behaviour. Maps errors to the standard ApiResponse envelope the
 * ported mobile services expect.
 */
@RestControllerAdvice(basePackages = "com.fyp.backend.controller.learning")
public class LearningExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Object>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleGeneric(Exception ex) {
        String message = ex.getMessage() != null ? ex.getMessage() : "Unexpected error";
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiResponse.error(message));
    }
}
