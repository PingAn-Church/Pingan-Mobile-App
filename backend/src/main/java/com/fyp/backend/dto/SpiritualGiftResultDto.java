package com.fyp.backend.dto;

import java.time.Instant;
import java.util.List;

public record SpiritualGiftResultDto(
        String assessmentVersion,
        List<Integer> scores,
        Instant completedAt) {
}
