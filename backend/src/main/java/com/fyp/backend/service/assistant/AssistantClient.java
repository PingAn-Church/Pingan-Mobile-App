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

    private JsonNode send(List<Map<String, Object>> conversation, AssistantTools tools) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.getModel());
        body.put("messages", conversation);
        body.put("max_tokens", properties.getMaxOutputTokens());
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

        JsonNode message = response == null ? null : response.path("choices").path(0).path("message");
        return message == null || message.isMissingNode() ? null : message;
    }
}
