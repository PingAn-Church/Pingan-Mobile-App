package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.ConversationReadState;
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

    private ArgumentCaptor<ConversationReadState> saved() {
        ArgumentCaptor<ConversationReadState> captor =
                ArgumentCaptor.forClass(ConversationReadState.class);
        verify(readStateRepository).save(captor.capture());
        return captor;
    }

    @Test
    void readingAConversationForTheFirstTimeCreatesTheWatermark() {
        when(readStateRepository.findByConversationIdAndUserId(7L, 3L)).thenReturn(Optional.empty());
        when(messageRepository.findNewestMessageId(7L)).thenReturn(120L);

        conversationReadStateService.markRead(7L, 3L);

        ConversationReadState state = saved().getValue();
        assertEquals(7L, state.getConversationId());
        assertEquals(3L, state.getUserId());
        assertEquals(120L, state.getLastReadMessageId());
    }

    @Test
    void readingAgainMovesTheWatermarkForward() {
        ConversationReadState existing = new ConversationReadState(7L, 3L, 40L);
        when(readStateRepository.findByConversationIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));
        when(messageRepository.findNewestMessageId(7L)).thenReturn(120L);

        conversationReadStateService.markRead(7L, 3L);

        assertEquals(120L, existing.getLastReadMessageId());
    }

    @Test
    void theWatermarkNeverGoesBackwards() {
        // The newest message being older than the mark means messages were deleted
        // out from under it. Rewinding would make everything since look unread.
        ConversationReadState existing = new ConversationReadState(7L, 3L, 120L);
        when(readStateRepository.findByConversationIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));
        when(messageRepository.findNewestMessageId(7L)).thenReturn(40L);

        conversationReadStateService.markRead(7L, 3L);

        assertEquals(120L, existing.getLastReadMessageId());
    }

    @Test
    void readingAnEmptyConversationLeavesTheMarkAlone() {
        ConversationReadState existing = new ConversationReadState(7L, 3L, 40L);
        when(readStateRepository.findByConversationIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));
        when(messageRepository.findNewestMessageId(7L)).thenReturn(null);

        conversationReadStateService.markRead(7L, 3L);

        assertEquals(40L, existing.getLastReadMessageId());
    }

    @Test
    void joiningPutsTheNewMemberAtTheEndRatherThanTheStart() {
        // Otherwise a member verified today opens the church-wide group and finds
        // every message ever posted in it marked unread.
        when(readStateRepository.findByConversationIdAndUserId(7L, 9L)).thenReturn(Optional.empty());
        when(messageRepository.findNewestMessageId(7L)).thenReturn(5000L);

        conversationReadStateService.markCaughtUp(7L, 9L);

        assertEquals(5000L, saved().getValue().getLastReadMessageId());
    }

    @Test
    void anonymousOrMissingIdsAreIgnored() {
        conversationReadStateService.markRead(null, 3L);
        conversationReadStateService.markRead(7L, null);

        verify(readStateRepository, never()).save(any(ConversationReadState.class));
    }
}
