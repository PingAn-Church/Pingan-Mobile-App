package com.fyp.backend.controller;

import com.fyp.backend.dto.TranslationRequestDto;
import com.fyp.backend.service.TranslationService;
import com.fyp.backend.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/translate")
public class TranslationController {

    private final TranslationService translationService;
    private final UserService userService;

    @Autowired
    public TranslationController(TranslationService translationService, UserService userService) {
        this.translationService = translationService;
        this.userService = userService;
    }

    /**
     * Handles translation requests.
     * Validates the user token before processing the translation.
     */
    @PostMapping
    public ResponseEntity<?> getTranslation(@RequestBody TranslationRequestDto translationRequest,
            HttpServletRequest request) {
        if (!translationService.isEnabled()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body("Translation service is disabled.");
        }

        // Extract userId from JWT Token using your established UserService pattern
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));

        System.out.println(" [TranslationController] Request from User ID: " + loggedInUserId);

        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }

        if (translationRequest == null) {
            return ResponseEntity.badRequest().body("Translation request is required.");
        }

        String text = translationRequest.getText();
        if (text == null || text.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Translation text cannot be empty.");
        }

        try {
            // Call the translation service
            String translatedResult = translationService.translateText(
                    text,
                    translationRequest.getTargetLanguage());

            // Return result in a map to match the "translatedText" key expected by your
            // Expo frontend
            return ResponseEntity.ok(Map.of("translatedText", translatedResult));

        } catch (Exception e) {
            System.err.println(" [TranslationController] Error: " + e.getMessage());
            return ResponseEntity.status(500).body("An error occurred during translation.");
        }
    }
}
