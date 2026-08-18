package com.fyp.backend.config.app;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

/**
 * Configuration for the in-app assistant.
 *
 * Values come from the gitignored {@code infra/.env}, which docker-compose passes
 * to the container and {@code spring.config.import} picks up locally. Empty
 * defaults keep the context bootable where they are absent — CI, tests, a local
 * run without credentials — in which case {@link #isConfigured()} is false and the
 * assistant simply never answers.
 */
@Configuration
@ConfigurationProperties(prefix = "assistant")
@Data
public class AssistantProperties {

    /** Master switch. Off by default: turning this on is a deliberate act. */
    private boolean enabled = false;

    /**
     * OpenAI-compatible base URL, e.g. {@code https://api.example.com/v1}.
     * {@code /chat/completions} is appended unless it is already there.
     */
    private String baseUrl = "";

    /** Never logged, never echoed into an error message. */
    private String apiKey = "";

    private String model = "";

    private int timeoutSeconds = 30;

    /**
     * How much of the conversation the model sees, ending at the message that
     * summoned it. Names are stripped before sending.
     */
    private int maxContextMessages = 10;

    private int maxOutputTokens = 600;

    /** Tool round trips per reply. A confused model would otherwise loop on budget. */
    private int maxToolRounds = 4;

    /** Tool calls the model may request in one round. */
    private int maxToolCallsPerRound = 3;

    /** Serialised tool output per round; longer results are truncated with a marker. */
    private int maxToolResultChars = 4000;

    private int perUserHourlyLimit = 5;

    private int perConversationDailyLimit = 200;

    /** Whether there is enough configuration to actually call a provider. */
    public boolean isConfigured() {
        return enabled
                && baseUrl != null && !baseUrl.isBlank()
                && apiKey != null && !apiKey.isBlank()
                && model != null && !model.isBlank();
    }

    /** The completions endpoint, tolerating a base URL given with or without the path. */
    public String completionsUrl() {
        String base = baseUrl == null ? "" : baseUrl.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base.endsWith("/chat/completions") ? base : base + "/chat/completions";
    }
}
