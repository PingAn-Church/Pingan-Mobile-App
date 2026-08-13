package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.SpiritualGiftResultDto;
import com.fyp.backend.dto.SpiritualGiftSubmission;
import com.fyp.backend.model.SpiritualGiftResult;
import com.fyp.backend.repository.SpiritualGiftResultRepository;

@ExtendWith(MockitoExtension.class)
class SpiritualGiftServiceTest {

    @Mock private SpiritualGiftResultRepository repository;

    private SpiritualGiftService service;

    @BeforeEach
    void setUp() {
        service = new SpiritualGiftService(repository, new ObjectMapper());
        lenient().when(repository.save(any(SpiritualGiftResult.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void scoresFiveInterleavedQuestionsPerGiftAndStoresOnlyTotals() {
        List<Integer> answers = new ArrayList<>(java.util.Collections.nCopies(125, 0));
        answers.set(0, 3);
        answers.set(25, 2);
        answers.set(50, 1);
        answers.set(75, 0);
        answers.set(100, 3);
        when(repository.findByUserId(42L)).thenReturn(Optional.empty());

        SpiritualGiftResultDto result = service.replaceLatest(
                42L, new SpiritualGiftSubmission("1", answers));

        assertEquals(9, result.scores().get(0));
        assertEquals(0, result.scores().get(1));
        assertEquals(25, result.scores().size());

        ArgumentCaptor<SpiritualGiftResult> saved = ArgumentCaptor.forClass(SpiritualGiftResult.class);
        verify(repository).save(saved.capture());
        assertEquals("[9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]",
                saved.getValue().getScoresJson());
    }

    @Test
    void replacesTheExistingSingleResult() {
        SpiritualGiftResult existing = new SpiritualGiftResult();
        existing.setId(7L);
        existing.setUserId(42L);
        existing.setScoresJson("[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]");
        when(repository.findByUserId(42L)).thenReturn(Optional.of(existing));

        SpiritualGiftResultDto result = service.replaceLatest(
                42L,
                new SpiritualGiftSubmission("1", java.util.Collections.nCopies(125, 3)));

        assertEquals(15, result.scores().get(24));
        assertEquals(7L, existing.getId());
        assertEquals(42L, existing.getUserId());
    }

    @Test
    void rejectsWrongVersionCountAndScoreRange() {
        assertThrows(IllegalArgumentException.class,
                () -> service.replaceLatest(1L,
                        new SpiritualGiftSubmission("old", java.util.Collections.nCopies(125, 0))));
        assertThrows(IllegalArgumentException.class,
                () -> service.replaceLatest(1L,
                        new SpiritualGiftSubmission("1", java.util.Collections.nCopies(124, 0))));

        List<Integer> invalid = new ArrayList<>(java.util.Collections.nCopies(125, 0));
        invalid.set(88, 4);
        assertThrows(IllegalArgumentException.class,
                () -> service.replaceLatest(1L, new SpiritualGiftSubmission("1", invalid)));
    }
}
