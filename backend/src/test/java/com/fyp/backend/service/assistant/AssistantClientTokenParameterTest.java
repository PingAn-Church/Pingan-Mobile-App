package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.lang.reflect.Method;

import org.junit.jupiter.api.Test;

/**
 * The provider tells us which output-budget parameter it wants by rejecting the
 * other one, so this is string parsing against a real error body — worth pinning
 * down, because getting it wrong means the assistant answers nobody.
 */
class AssistantClientTokenParameterTest {

    /** The exact body OpenAI returned when the assistant first ran against gpt-5. */
    private static final String OPENAI_REJECTION = """
            {
              "error": {
                "message": "Unsupported parameter: 'max_tokens' is not supported with this model. \
            Use 'max_completion_tokens' instead.",
                "type": "invalid_request_error",
                "param": "max_tokens",
                "code": "unsupported_parameter"
              }
            }""";

    private static String alternative(String used, String body) {
        try {
            Method method = AssistantClient.class.getDeclaredMethod(
                    "alternativeTokenParameter", String.class, String.class);
            method.setAccessible(true);
            return (String) method.invoke(null, used, body);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void aNewerOpenAiModelSendsUsToMaxCompletionTokens() {
        assertEquals(AssistantClient.MAX_COMPLETION_TOKENS,
                alternative(AssistantClient.MAX_TOKENS, OPENAI_REJECTION));
    }

    /** Providers that only know the old name usually just call it unrecognised. */
    @Test
    void aProviderThatWantsTheOldNameSendsUsBack() {
        String body = "{\"error\":{\"message\":\"Unrecognized request argument supplied: "
                + "max_completion_tokens\",\"type\":\"invalid_request_error\"}}";
        assertEquals(AssistantClient.MAX_TOKENS,
                alternative(AssistantClient.MAX_COMPLETION_TOKENS, body));
    }

    /** A 400 about anything else must be rethrown, not answered with a guess. */
    @Test
    void anUnrelatedBadRequestIsNotTreatedAsAParameterProblem() {
        assertNull(alternative(AssistantClient.MAX_TOKENS,
                "{\"error\":{\"message\":\"Invalid model id\",\"code\":\"model_not_found\"}}"));
        assertNull(alternative(AssistantClient.MAX_TOKENS,
                "{\"error\":{\"message\":\"context_length_exceeded\"}}"));
        assertNull(alternative(AssistantClient.MAX_TOKENS, ""));
        assertNull(alternative(AssistantClient.MAX_TOKENS, null));
    }

    /**
     * A complaint about some other parameter must not flip ours, even though the
     * body reads like a parameter error.
     */
    @Test
    void aComplaintAboutADifferentParameterIsIgnored() {
        assertNull(alternative(AssistantClient.MAX_TOKENS,
                "{\"error\":{\"message\":\"Unsupported parameter: 'temperature' is not supported\","
                        + "\"param\":\"temperature\",\"code\":\"unsupported_parameter\"}}"));
    }

    /** The two names must not be confusable as substrings of one another. */
    @Test
    void theTwoNamesDoNotOverlap() {
        assertEquals(-1, AssistantClient.MAX_COMPLETION_TOKENS.indexOf(AssistantClient.MAX_TOKENS));
    }
}
