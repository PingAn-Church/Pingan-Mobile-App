package com.fyp.backend.service.assistant;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.config.app.AssistantProperties;

/**
 * Calls an OpenAI-compatible chat-completions endpoint and runs the tool loop.
 *
 * One POST to one endpoint, so this uses Spring's own {@code RestClient} rather
 * than pulling in a vendor SDK. Responses are read as {@link JsonNode} because
 * compatible providers differ in the fields they add around the parts that matter.
 */
@Service
public class AssistantClient {

    private static final Logger log = LoggerFactory.getLogger(AssistantClient.class);

    /** What most OpenAI-compatible providers, and OpenAI's older models, expect. */
    static final String MAX_TOKENS = "max_tokens";

    /** What OpenAI's newer (reasoning-capable) models require instead. */
    static final String MAX_COMPLETION_TOKENS = "max_completion_tokens";

    /**
     * Which spelling this provider turned out to want, remembered for the life of
     * the process so only the first call can ever pay for the negotiation.
     */
    private volatile String negotiatedTokenParameter = MAX_TOKENS;

    /** Sent only when a provider asks for it. Null means the field is omitted. */
    static final String REASONING_EFFORT = "reasoning_effort";

    /** gpt-5.x will not run function tools unless reasoning is switched off. */
    static final String NO_REASONING = "none";

    private volatile String negotiatedReasoningEffort = null;

    /**
     * Set once a provider has rejected reasoning_effort outright, so we never try
     * to reintroduce it. Without this the two branches below could take turns
     * adding and removing the field on every call.
     */
    private volatile boolean reasoningEffortRefused = false;

    /** Enough to settle both known quirks in one request; never a blind retry loop. */
    static final int MAX_SHAPE_ADAPTATIONS = 3;

    private final AssistantProperties properties;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient http;

    public AssistantClient(AssistantProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        int timeout = Math.max(1, properties.getTimeoutSeconds()) * 1000;
        factory.setConnectTimeout(timeout);
        factory.setReadTimeout(timeout);
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isAvailable() {
        return properties.isConfigured();
    }

    /**
     * Runs the conversation to a final answer, executing any tools the model asks for.
     *
     * @param messages the system prompt followed by the conversation, oldest first
     * @return the assistant's text, or null if it produced none
     */
    public String complete(List<Map<String, Object>> messages, AssistantTools tools) {
        if (!isAvailable()) {
            throw new IllegalStateException("The assistant is not configured.");
        }

        List<Map<String, Object>> conversation = new ArrayList<>(messages);
        long startedAt = System.currentTimeMillis();

        for (int round = 0; round <= properties.getMaxToolRounds(); round++) {
            // The last round is answered without tools, so a model that keeps
            // reaching for them is forced to produce something rather than
            // spending the budget and returning nothing.
            boolean toolsOffered = round < properties.getMaxToolRounds();
            JsonNode message = send(conversation, toolsOffered ? tools : null);
            if (message == null) {
                return null;
            }

            JsonNode toolCalls = message.path("tool_calls");
            if (!toolsOffered || !toolCalls.isArray() || toolCalls.isEmpty()) {
                log.info("Assistant reply from model {} in {} ms after {} tool round(s).",
                        properties.getModel(), System.currentTimeMillis() - startedAt, round);
                return message.path("content").asText(null);
            }

            // The assistant's own message has to go back verbatim: the provider
            // matches each tool result to the call id it carries.
            conversation.add(mapper.convertValue(message, new com.fasterxml.jackson.core.type.TypeReference<
                    Map<String, Object>>() {
            }));

            int calls = 0;
            for (JsonNode call : toolCalls) {
                if (++calls > properties.getMaxToolCallsPerRound()) {
                    break;
                }
                conversation.add(runTool(call, tools));
            }
        }
        return null;
    }

    private Map<String, Object> runTool(JsonNode call, AssistantTools tools) {
        String id = call.path("id").asText("");
        String name = call.path("function").path("name").asText("");
        JsonNode arguments = parseArguments(call.path("function").path("arguments").asText(""));

        String result;
        try {
            result = tools.execute(name, arguments);
        } catch (RuntimeException e) {
            // AssistantTools must not throw, but a bug there must not become five
            // paid retries via the listener's retry advice either.
            log.warn("Assistant tool {} failed: {}", name, e.toString());
            result = "{\"error\":\"that lookup failed\"}";
        }
        if (result != null && result.length() > properties.getMaxToolResultChars()) {
            result = result.substring(0, properties.getMaxToolResultChars()) + "…(truncated)";
        }

        Map<String, Object> message = new LinkedHashMap<>();
        message.put("role", "tool");
        message.put("tool_call_id", id);
        message.put("name", name);
        message.put("content", result == null ? "" : result);
        return message;
    }

    /** Arguments arrive as a JSON string. Malformed ones become an empty object. */
    private JsonNode parseArguments(String raw) {
        try {
            JsonNode parsed = mapper.readTree(raw == null || raw.isBlank() ? "{}" : raw);
            return parsed.isObject() ? parsed : mapper.createObjectNode();
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    /**
     * Sends one request, adapting the request's shape to whatever this provider
     * turns out to accept.
     *
     * "OpenAI-compatible" is a family resemblance, not a specification, and the
     * differences only show up as a 400. Rather than encode a matrix of provider
     * quirks, this reads the complaint, changes the one thing it named, and
     * remembers — so a provider costs at most a few rejected requests once per
     * restart, and none at all if the settings are pinned in config.
     *
     * Bounded, and every adaptation is one-way, so this cannot oscillate.
     */
    private JsonNode send(List<Map<String, Object>> conversation, AssistantTools tools) {
        for (int attempt = 0; ; attempt++) {
            try {
                return post(conversation, tools);
            } catch (HttpClientErrorException.BadRequest rejection) {
                if (attempt >= MAX_SHAPE_ADAPTATIONS
                        || !adaptRequestShape(rejection.getResponseBodyAsString())) {
                    throw rejection;
                }
            }
        }
    }

    private JsonNode post(List<Map<String, Object>> conversation, AssistantTools tools) {
        String tokenParameter = tokenParameter();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("messages", conversation);
        // Deliberately no temperature/top_p: the newer reasoning models reject any
        // value but the default, and nothing here needs to move it.
        body.put(tokenParameter, properties.getMaxOutputTokens());
        String effort = reasoningEffort();
        if (effort != null) {
            body.put("reasoning_effort", effort);
        }
        if (tools != null) {
            List<Map<String, Object>> specifications = tools.specifications();
            if (!specifications.isEmpty()) {
                body.put("tools", specifications);
                body.put("tool_choice", "auto");
            }
        }

        JsonNode response = http.post()
                .uri(properties.completionsUrl())
                .contentType(MediaType.APPLICATION_JSON)
                // The key goes in a header and nowhere else — never a log line,
                // never an exception message, never the request body.
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getApiKey())
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        JsonNode choice = response == null ? null : response.path("choices").path(0);
        if (choice != null && "length".equals(choice.path("finish_reason").asText(""))) {
            // On a reasoning model the budget covers invisible reasoning as well as
            // the reply, so this usually means the answer was cut off — or never
            // written at all — rather than that the model rambled.
            log.warn("Assistant reply hit the {} limit of {}; raise assistant.max-output-tokens.",
                    tokenParameter, properties.getMaxOutputTokens());
        }

        JsonNode message = choice == null ? null : choice.path("message");
        return message == null || message.isMissingNode() ? null : message;
    }

    private String tokenParameter() {
        String configured = properties.getMaxTokensParameter();
        if (MAX_TOKENS.equalsIgnoreCase(configured) || MAX_COMPLETION_TOKENS.equalsIgnoreCase(configured)) {
            return configured.toLowerCase(Locale.ROOT);
        }
        return negotiatedTokenParameter;
    }

    /** Null means "send nothing", which is what every provider but a reasoning model wants. */
    private String reasoningEffort() {
        String configured = properties.getReasoningEffort();
        if (configured == null || configured.isBlank() || "auto".equalsIgnoreCase(configured)) {
            return negotiatedReasoningEffort;
        }
        return "off".equalsIgnoreCase(configured) ? null : configured.trim();
    }

    /**
     * Changes one thing the provider objected to, and reports whether anything moved.
     *
     * Returning false means the 400 was about something we cannot fix by reshaping
     * the request — a bad model id, an over-long context — and the caller rethrows
     * rather than retrying blind.
     */
    private boolean adaptRequestShape(String responseBody) {
        String body = responseBody == null ? "" : responseBody;
        String lower = body.toLowerCase(Locale.ROOT);
        boolean parameterComplaint = lower.contains("unsupported") || lower.contains("unrecognized")
                || lower.contains("not supported") || lower.contains("unknown parameter");
        if (!parameterComplaint) {
            return false;
        }

        // The output budget has two spellings and no universal one: OpenAI's newer
        // models refuse max_tokens, most other providers only know it. The names do
        // not overlap as substrings, so naming one cannot match the other.
        String used = tokenParameter();
        if (body.contains(used)) {
            String alternative = MAX_TOKENS.equals(used) ? MAX_COMPLETION_TOKENS : MAX_TOKENS;
            log.info("Provider rejected '{}' for the output budget; using '{}' from now on. "
                    + "Pin assistant.max-tokens-parameter to skip this.", used, alternative);
            negotiatedTokenParameter = alternative;
            return true;
        }

        // gpt-5.x refuses function tools while it is reasoning on this endpoint,
        // and asks for reasoning_effort 'none' — a parameter we were not sending at
        // all, because its own default is what conflicts. Sending 'none' explicitly
        // is what buys us tool calls; the alternative is the /v1/responses API,
        // which no other compatible provider implements.
        if (body.contains(REASONING_EFFORT) && !reasoningEffortRefused) {
            if (negotiatedReasoningEffort == null) {
                log.info("Provider will not run function tools while reasoning; sending "
                        + "reasoning_effort 'none' from now on. Pin assistant.reasoning-effort "
                        + "to skip this.");
                negotiatedReasoningEffort = NO_REASONING;
                return true;
            }
            log.info("Provider does not accept reasoning_effort; dropping it from now on.");
            negotiatedReasoningEffort = null;
            reasoningEffortRefused = true;
            return true;
        }

        return false;
    }
}
