package com.fyp.backend.service;

/**
 * Push notification text that is only pinned down once the recipient is known.
 *
 * A single send fans out to many people who may not share a language, so callers
 * hand over a recipe rather than a finished string and the push service renders
 * it once per recipient. Build instances through {@link PushMessages}.
 */
@FunctionalInterface
public interface LocalizedText {

    /**
     * @param language the recipient's app language ("en" / "zh"), possibly null
     * @return the text to display on that recipient's device
     */
    String render(String language);
}
