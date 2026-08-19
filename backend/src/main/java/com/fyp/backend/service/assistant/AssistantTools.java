package com.fyp.backend.service.assistant;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * The tools the assistant may call, and how to run one.
 *
 * Kept as an interface so the client in this package can be built and tested
 * without the app-data tools, and so a test can hand it a stub.
 */
public interface AssistantTools {

    /**
     * OpenAI-shaped tool specifications:
     * {@code {"type":"function","function":{"name":..,"description":..,"parameters":..}}}
     */
    List<Map<String, Object>> specifications();

    /**
     * Runs one tool call and returns what the model should see.
     *
     * MUST NOT throw. Arguments are model output, and via prompt injection they are
     * attacker-influenced — a member can ask the assistant to call a tool with
     * {@code limit=99999}. An exception escaping here reaches the listener's retry
     * advice and turns one bad argument into several paid LLM calls, so invalid
     * input comes back as a short message the model can recover from instead.
     */
    String execute(String name, JsonNode arguments);
}
