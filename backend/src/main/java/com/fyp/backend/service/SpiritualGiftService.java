package com.fyp.backend.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.SpiritualGiftResultDto;
import com.fyp.backend.dto.SpiritualGiftSubmission;
import com.fyp.backend.model.SpiritualGiftResult;
import com.fyp.backend.repository.SpiritualGiftResultRepository;

@Service
public class SpiritualGiftService {

    public static final String ASSESSMENT_VERSION = "1";
    public static final int GIFT_COUNT = 25;
    public static final int QUESTION_COUNT = 125;

    private final SpiritualGiftResultRepository repository;
    private final ObjectMapper objectMapper;

    public SpiritualGiftService(SpiritualGiftResultRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Optional<SpiritualGiftResultDto> getLatest(Long userId) {
        return repository.findByUserId(userId).map(this::toDto);
    }

    /**
     * Validate and score the transient answers, then replace the user's single
     * stored result. Answers are deliberately not copied into the entity.
     */
    @Transactional
    public SpiritualGiftResultDto replaceLatest(Long userId, SpiritualGiftSubmission submission) {
        if (submission == null || !ASSESSMENT_VERSION.equals(submission.assessmentVersion())) {
            throw new IllegalArgumentException("Unsupported assessment version");
        }

        List<Integer> answers = submission.answers();
        if (answers == null || answers.size() != QUESTION_COUNT) {
            throw new IllegalArgumentException("Exactly 125 answers are required");
        }

        List<Integer> scores = new ArrayList<>(java.util.Collections.nCopies(GIFT_COUNT, 0));
        for (int i = 0; i < answers.size(); i++) {
            Integer answer = answers.get(i);
            if (answer == null || answer < 0 || answer > 3) {
                throw new IllegalArgumentException("Every answer must be an integer from 0 to 3");
            }
            int giftIndex = i % GIFT_COUNT;
            scores.set(giftIndex, scores.get(giftIndex) + answer);
        }

        SpiritualGiftResult result = repository.findByUserId(userId).orElseGet(SpiritualGiftResult::new);
        result.setUserId(userId);
        result.setAssessmentVersion(ASSESSMENT_VERSION);
        result.setScoresJson(writeScores(scores));
        result.setCompletedAt(Instant.now());
        return toDto(repository.save(result));
    }

    private SpiritualGiftResultDto toDto(SpiritualGiftResult result) {
        return new SpiritualGiftResultDto(
                result.getAssessmentVersion(),
                readScores(result.getScoresJson()),
                result.getCompletedAt());
    }

    private String writeScores(List<Integer> scores) {
        try {
            return objectMapper.writeValueAsString(scores);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize spiritual gift scores", e);
        }
    }

    private List<Integer> readScores(String json) {
        try {
            List<Integer> scores = objectMapper.readValue(json, new TypeReference<List<Integer>>() { });
            if (scores.size() != GIFT_COUNT) {
                throw new IllegalStateException("Stored spiritual gift result has an invalid score count");
            }
            return List.copyOf(scores);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not read stored spiritual gift scores", e);
        }
    }
}
