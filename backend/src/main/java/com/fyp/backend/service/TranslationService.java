package com.fyp.backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@Service
public class TranslationService {

    private final RestTemplate restTemplate;
    private final String libreUrl;
    private final boolean enabled;

    // Falls back to docker service name when env is not provided.
    private static final String DEFAULT_LIBRE_URL = "http://librefyp:5000/translate";

    @Autowired
    public TranslationService() {
        this.restTemplate = new RestTemplate();
        String configuredLibreUrl = System.getenv("LIBRE_URL");
        this.libreUrl = (configuredLibreUrl == null || configuredLibreUrl.isBlank())
                ? DEFAULT_LIBRE_URL
                : configuredLibreUrl.trim();
        this.enabled = "true".equalsIgnoreCase(String.valueOf(System.getenv("ENABLE_LIBRE_TRANSLATE")).trim());
    }

    public boolean isEnabled() {
        return enabled;
    }

    private String normalizeTargetLanguage(String targetLang) {
        if (targetLang == null || targetLang.isBlank()) {
            return "en";
        }

        String normalized = targetLang.trim().toLowerCase(Locale.ROOT).replace('_', '-');
        int separatorIndex = normalized.indexOf('-');
        if (separatorIndex > 0) {
            normalized = normalized.substring(0, separatorIndex);
        }

        return switch (normalized) {
            case "zh", "en" -> normalized;
            default -> "en";
        };
    }

    /**
     * Handles the translation logic by calling the LibreTranslate API.
     */
    public String translateText(String text, String targetLang) {
        if (!enabled) {
            throw new IllegalStateException("Translation service is disabled");
        }

        String normalizedTargetLang = normalizeTargetLanguage(targetLang);
        System.out.println(" [TranslationService] Request received. Target Language: " + normalizedTargetLang);

        if (text == null || text.trim().isEmpty()) {
            System.out.println(" [TranslationService] Received empty text. Skipping translation.");
            return text;
        }

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("q", text);
        requestBody.put("source", "auto");
        requestBody.put("target", normalizedTargetLang);
        requestBody.put("format", "text");

        try {
            System.out.println(" [TranslationService] Calling LibreTranslate API at: " + libreUrl);
            Map<String, Object> response = restTemplate.postForObject(libreUrl, requestBody, Map.class);

            if (response != null && response.containsKey("translatedText")) {
                String translatedResult = (String) response.get("translatedText");
                System.out.println(" [TranslationService] Translation successful.");
                if (translatedResult == null || translatedResult.isBlank()) {
                    return text;
                }
                return translatedResult;
            } else {
                System.out.println(" [TranslationService] Unexpected response format from API.");
                throw new RuntimeException("Invalid response from translation engine");
            }

        } catch (Exception e) {
            System.out.println("Error during translation API call: " + e.getMessage());
            throw new RuntimeException("Translation service unavailable", e);
        }
    }
}