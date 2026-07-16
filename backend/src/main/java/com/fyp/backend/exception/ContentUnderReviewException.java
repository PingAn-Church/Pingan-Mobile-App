package com.fyp.backend.exception;

public class ContentUnderReviewException extends RuntimeException {
    public ContentUnderReviewException() {
        super("This content is currently under review and cannot be edited.");
    }
}
