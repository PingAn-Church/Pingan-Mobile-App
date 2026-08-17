package com.fyp.backend.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.repository.ConversationReadStateRepository;
import com.fyp.backend.repository.MessageRepository;

/**
 * The read watermark that replaced a delivery row per message per recipient.
 *
 * The one rule that has to hold is that it only ever moves forward: scrolling
 * back through old history, or a stale client reporting a position it read
 * minutes ago, must not resurrect unread badges for everything since.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConversationReadStateServiceTest {

    @Mock private ConversationReadStateRepository readStateRepository;
    @Mock private MessageRepository messageRepository;

    @InjectMocks private ConversationReadStateService conversationReadStateService;

    @Test
    void readingAConversationForTheFirstTimeCreatesTheWatermark() {
        when(messageRepository.findNewestMessageId(7L)).thenReturn(120L);

        conversationReadStateService.markRead(7L, 3L);

        verify(readStateRepository).advanceWatermark(7L, 3L, 120L);
    }

    @Test
    void readingAgainMovesTheWatermarkForward() {
        when(messageRepository.findNewestMessageId(7L)).thenReturn(120L);

        conversationReadStateService.markRead(7L, 3L);

        verify(readStateRepository).advanceWatermark(7L, 3L, 120L);
    }

    @Test
    void aStaleValueIsDelegatedToTheAtomicMonotonicUpsert() {
        when(messageRepository.findNewestMessageId(7L)).thenReturn(40L);

        conversationReadStateService.markRead(7L, 3L);

        verify(readStateRepository).advanceWatermark(7L, 3L, 40L);
    }

    @Test
    void readingAnEmptyConversationLeavesTheMarkAlone() {
        when(messageRepository.findNewestMessageId(7L)).thenReturn(null);

        conversationReadStateService.markRead(7L, 3L);

        verify(readStateRepository, never()).advanceWatermark(any(), any(), any());
    }

    @Test
    void joiningPutsTheNewMemberAtTheEndRatherThanTheStart() {
        // Otherwise a member verified today opens the church-wide group and finds
        // every message ever posted in it marked unread.
        when(messageRepository.findNewestMessageId(7L)).thenReturn(5000L);

        conversationReadStateService.markCaughtUp(7L, 9L);

        verify(readStateRepository).advanceWatermark(7L, 9L, 5000L);
    }

    @Test
    void anonymousOrMissingIdsAreIgnored() {
        conversationReadStateService.markRead(null, 3L);
        conversationReadStateService.markRead(7L, null);

        verify(readStateRepository, never()).advanceWatermark(any(), any(), any());
    }
}
