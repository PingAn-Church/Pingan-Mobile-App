package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;

import com.fyp.backend.config.app.AssistantProperties;

/**
 * "OpenAI-compatible" is a family resemblance, not a specification, and the
 * differences only surface as a 400. The client reads the complaint and reshapes
 * the request — which is string parsing against real error bodies, so it is worth
 * pinning down: getting it wrong means the assistant answers nobody.
 */
class AssistantClientTokenParameterTest {

    /** Returned when the assistant first ran against gpt-5.6-luna. */
    private static final String MAX_TOKENS_REJECTION = """
            {
              "error": {
                "message": "Unsupported parameter: 'max_tokens' is not supported with this model. \
            Use 'max_completion_tokens' instead.",
                "type": "invalid_request_error",
                "param": "max_tokens",
                "code": "unsupported_parameter"
              }
            }""";

    /** The very next thing that model said, once the budget parameter was right. */
    private static final String REASONING_REJECTION = """
            {
              "error": {
                "message": "Function tools with reasoning_effort are not supported for \
            gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses \
            or set reasoning_effort to 'none'.",
                "type": "invalid_request_error",
                "param": "reasoning_effort",
                "code": null
              }
            }""";

    private static AssistantClient client() {
        AssistantProperties properties = new AssistantProperties();
        properties.setEnabled(true);
        properties.setBaseUrl("https://api.example.com/v1");
        properties.setApiKey("not-a-real-key");
        properties.setModel("some-model");
        return new AssistantClient(properties);
    }

    private static boolean adapt(AssistantClient client, String body) {
        try {
            Method method = AssistantClient.class.getDeclaredMethod("adaptRequestShape", String.class);
            method.setAccessible(true);
            return (boolean) method.invoke(client, body);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Object field(AssistantClient client, String name) {
        try {
            Field declared = AssistantClient.class.getDeclaredField(name);
            declared.setAccessible(true);
            return declared.get(client);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void aNewerOpenAiModelMovesUsToMaxCompletionTokens() {
        AssistantClient client = client();
        assertTrue(adapt(client, MAX_TOKENS_REJECTION));
        assertEquals(AssistantClient.MAX_COMPLETION_TOKENS,
                field(client, "negotiatedTokenParameter"));
    }

    @Test
    void aModelThatWillNotUseToolsWhileReasoningGetsReasoningEffortNone() {
        AssistantClient client = client();
        assertTrue(adapt(client, REASONING_REJECTION));
        assertEquals(AssistantClient.NO_REASONING, field(client, "negotiatedReasoningEffort"));
    }

    /** Both quirks in a row is exactly what gpt-5.6-luna did, one request apart. */
    @Test
    void bothQuirksSettleWithinTheAdaptationBudget() {
        AssistantClient client = client();
        int adaptations = 0;
        if (adapt(client, MAX_TOKENS_REJECTION)) adaptations++;
        if (adapt(client, REASONING_REJECTION)) adaptations++;

        assertTrue(adaptations <= AssistantClient.MAX_SHAPE_ADAPTATIONS);
        assertEquals(AssistantClient.MAX_COMPLETION_TOKENS, field(client, "negotiatedTokenParameter"));
        assertEquals(AssistantClient.NO_REASONING, field(client, "negotiatedReasoningEffort"));
    }

    /** A provider with no such parameter must make us drop it, once and for good. */
    @Test
    void aProviderThatRejectsReasoningEffortOutrightMakesUsDropItPermanently() {
        AssistantClient client = client();
        adapt(client, REASONING_REJECTION);
        assertEquals(AssistantClient.NO_REASONING, field(client, "negotiatedReasoningEffort"));

        String unknown = "{\"error\":{\"message\":\"Unrecognized request argument supplied: "
                + "reasoning_effort\",\"type\":\"invalid_request_error\"}}";
        assertTrue(adapt(client, unknown));
        assertNull(field(client, "negotiatedReasoningEffort"));

        // And never comes back — otherwise the two branches would take turns adding
        // and removing the field on every single call.
        assertFalse(adapt(client, REASONING_REJECTION));
        assertNull(field(client, "negotiatedReasoningEffort"));
    }

    @Test
    void aProviderThatWantsTheOldBudgetNameSendsUsBack() {
        AssistantClient client = client();
        adapt(client, MAX_TOKENS_REJECTION);
        String unknown = "{\"error\":{\"message\":\"Unrecognized request argument supplied: "
                + "max_completion_tokens\",\"type\":\"invalid_request_error\"}}";
        assertTrue(adapt(client, unknown));
        assertEquals(AssistantClient.MAX_TOKENS, field(client, "negotiatedTokenParameter"));
    }

    /** A 400 we cannot fix by reshaping must be rethrown, not retried blind. */
    @Test
    void anUnrelatedBadRequestIsNotTreatedAsAShapeProblem() {
        AssistantClient client = client();
        assertFalse(adapt(client, "{\"error\":{\"message\":\"Invalid model id\",\"code\":\"model_not_found\"}}"));
        assertFalse(adapt(client, "{\"error\":{\"message\":\"context_length_exceeded\"}}"));
        assertFalse(adapt(client, ""));
        assertFalse(adapt(client, null));
    }

    /** A complaint about some other parameter must not disturb ours. */
    @Test
    void aComplaintAboutADifferentParameterIsIgnored() {
        AssistantClient client = client();
        assertFalse(adapt(client,
                "{\"error\":{\"message\":\"Unsupported parameter: 'temperature' is not supported\","
                        + "\"param\":\"temperature\",\"code\":\"unsupported_parameter\"}}"));
        assertEquals(AssistantClient.MAX_TOKENS, field(client, "negotiatedTokenParameter"));
        assertNull(field(client, "negotiatedReasoningEffort"));
    }

    /** The two budget names must not be confusable as substrings of one another. */
    @Test
    void theTwoBudgetNamesDoNotOverlap() {
        assertEquals(-1, AssistantClient.MAX_COMPLETION_TOKENS.indexOf(AssistantClient.MAX_TOKENS));
    }
}
