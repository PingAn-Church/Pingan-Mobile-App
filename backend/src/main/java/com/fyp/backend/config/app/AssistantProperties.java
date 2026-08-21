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

    /**
     * Whether photos in the context are shown to the model.
     *
     * Sent inline as base64 data URLs, fetched from OSS by the server: the model
     * never sees a storage URL and the bucket never has to be reachable from the
     * provider. Switch off for a model without image input — each photo then
     * becomes a "[photo]" placeholder, as before.
     */
    private boolean imageInput = true;

    /**
     * How many photos one request may carry, newest first; older ones in the
     * window stay placeholders. Every inlined photo is paid for in input tokens
     * and request size, and a ten-message window in a lively group can be all
     * photos.
     */
    private int maxImagesPerRequest = 4;

    /**
     * Largest photo that is inlined, in bytes as stored. Larger ones stay
     * placeholders: base64 adds a third, and providers cap the request body.
     */
    private long maxImageBytes = 5L * 1024 * 1024;

    /**
     * The provider's {@code detail} hint for photos: {@code auto}, {@code low}
     * or {@code high}. {@code low} is a fixed, cheap token cost per image but a
     * 512px downscale that cannot read a poster; {@code auto} lets the provider
     * choose. Omitted from the request on {@code auto}.
     */
    private String imageDetail = "auto";

    /**
     * The output budget.
     *
     * Generous because on a reasoning model this covers the model's invisible
     * reasoning as well as the reply — too small a value there is spent thinking
     * and returns an empty answer rather than a short one. It is a ceiling, not a
     * target: a model writing three sentences still bills for three sentences.
     */
    private int maxOutputTokens = 2000;

    /**
     * Which name to send the output budget under: {@code max_tokens},
     * {@code max_completion_tokens}, or {@code auto}.
     *
     * OpenAI's newer models refuse {@code max_tokens}; most other compatible
     * providers accept only that. On {@code auto} the client starts with
     * {@code max_tokens} and switches for good the first time a provider says it
     * wants the other one, which costs a single rejected request per restart. Pin
     * it once you know, and that cost goes away.
     */
    private String maxTokensParameter = "auto";

    /**
     * {@code reasoning_effort} to send, or {@code auto} / {@code off}.
     *
     * Normally omitted — most models have no such parameter. But gpt-5.x refuses to
     * run function tools while it is reasoning on /v1/chat/completions and asks for
     * {@code none}, so on {@code auto} the client adds it the first time a provider
     * says so. {@code off} never sends it; any other value is sent verbatim, which
     * is how you would ask for {@code low} or {@code high} on a model that has no
     * quarrel with tools.
     */
    private String reasoningEffort = "auto";

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
