package com.fyp.backend.service.assistant;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
     * Sends one request, negotiating the output-budget parameter if the provider
     * disagrees about its name.
     *
     * OpenAI's newer models refuse {@code max_tokens} and require
     * {@code max_completion_tokens}; most other OpenAI-compatible providers, and
     * OpenAI's older models, accept only {@code max_tokens}. There is no name that
     * works everywhere, so the first rejection teaches this client which one this
     * provider wants and every later call uses it. Pin
     * {@code assistant.max-tokens-parameter} to skip even that first retry.
     */
    private JsonNode send(List<Map<String, Object>> conversation, AssistantTools tools) {
        String parameter = tokenParameter();
        try {
            return post(conversation, tools, parameter);
        } catch (HttpClientErrorException.BadRequest rejection) {
            String alternative = alternativeTokenParameter(parameter, rejection.getResponseBodyAsString());
            if (alternative == null) {
                throw rejection;
            }
            log.info("Provider rejected '{}' for the output budget; using '{}' from now on. "
                    + "Set assistant.max-tokens-parameter to skip this negotiation.",
                    parameter, alternative);
            negotiatedTokenParameter = alternative;
            return post(conversation, tools, alternative);
        }
    }

    private JsonNode post(List<Map<String, Object>> conversation, AssistantTools tools,
                          String tokenParameter) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("messages", conversation);
        // Deliberately no temperature/top_p: the newer reasoning models reject any
        // value but the default, and nothing here needs to move it.
        body.put(tokenParameter, properties.getMaxOutputTokens());
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
            return configured.toLowerCase(java.util.Locale.ROOT);
        }
        return negotiatedTokenParameter;
    }

    /**
     * The other spelling, when a 400 says the one we used is the problem.
     *
     * Only reacts to a rejection that actually names our parameter and reads like a
     * parameter complaint — a 400 about anything else is rethrown rather than
     * guessed at. Note the two names do not overlap as substrings, so the check
     * cannot confuse them.
     */
    private static String alternativeTokenParameter(String used, String responseBody) {
        String body = responseBody == null ? "" : responseBody;
        String lower = body.toLowerCase(java.util.Locale.ROOT);
        boolean parameterComplaint = lower.contains("unsupported") || lower.contains("unrecognized")
                || lower.contains("not supported") || lower.contains("unknown parameter");
        if (!parameterComplaint || !body.contains(used)) {
            return null;
        }
        return MAX_TOKENS.equals(used) ? MAX_COMPLETION_TOKENS : MAX_TOKENS;
    }
}
