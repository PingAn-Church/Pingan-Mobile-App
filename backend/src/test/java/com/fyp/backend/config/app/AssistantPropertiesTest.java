package com.fyp.backend.config.app;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AssistantPropertiesTest {

    private static AssistantProperties configured(String baseUrl) {
        AssistantProperties properties = new AssistantProperties();
        properties.setEnabled(true);
        properties.setBaseUrl(baseUrl);
        properties.setApiKey("not-a-real-key");
        properties.setModel("some-model");
        return properties;
    }

    @Test
    void completionsPathIsAppendedButNeverDoubled() {
        assertEquals("https://api.example.com/v1/chat/completions",
                configured("https://api.example.com/v1").completionsUrl());
        assertEquals("https://api.example.com/v1/chat/completions",
                configured("https://api.example.com/v1/").completionsUrl());
        assertEquals("https://api.example.com/v1/chat/completions",
                configured("https://api.example.com/v1/chat/completions").completionsUrl());
    }

    /** Missing credentials must read as "off", not as a half-configured client. */
    @Test
    void anyMissingCredentialLeavesItUnconfigured() {
        assertTrue(configured("https://api.example.com/v1").isConfigured());

        AssistantProperties noKey = configured("https://api.example.com/v1");
        noKey.setApiKey("");
        assertFalse(noKey.isConfigured());

        AssistantProperties noModel = configured("https://api.example.com/v1");
        noModel.setModel("  ");
        assertFalse(noModel.isConfigured());

        AssistantProperties disabled = configured("https://api.example.com/v1");
        disabled.setEnabled(false);
        assertFalse(disabled.isConfigured());
    }

    @Test
    void defaultsAreOffAndBounded() {
        AssistantProperties defaults = new AssistantProperties();
        assertFalse(defaults.isConfigured());
        assertTrue(defaults.getMaxToolRounds() > 0);
        assertTrue(defaults.getMaxToolResultChars() > 0);
        assertTrue(defaults.getMaxContextMessages() > 0);
    }
}
