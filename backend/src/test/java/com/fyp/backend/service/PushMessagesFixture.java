package com.fyp.backend.service;

import org.springframework.context.support.ResourceBundleMessageSource;

/**
 * Builds a {@link PushMessages} backed by the real messages*.properties bundles,
 * configured the same way Spring Boot configures the application's MessageSource.
 * Tests that assert on notification wording want the actual shipped strings, not
 * a mock's nulls.
 */
final class PushMessagesFixture {

    private PushMessagesFixture() {
    }

    static PushMessages real() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return new PushMessages(source);
    }
}
