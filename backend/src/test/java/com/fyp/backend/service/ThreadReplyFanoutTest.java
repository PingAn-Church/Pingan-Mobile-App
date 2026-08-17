package com.fyp.backend.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

@ExtendWith(MockitoExtension.class)
class ThreadReplyFanoutTest {

    @Mock private ThreadReplyRepository replyRepository;
    @Mock private ThreadRepository threadRepository;
    @Mock private UserRepository userRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private ModerationEventPublisher moderationEventPublisher;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();
    @Mock private TopicSubscriptionService topicSubscriptionService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();
    @Mock private ThreadContentCleanupService threadContentCleanupService;
    @InjectMocks private ThreadReplyService service;

    @BeforeEach
    void beginSynchronization() {
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void topicPushIsQueuedOnlyAfterReplyCommit() {
        User author = new User();
        author.setId(1L);
        author.setEmail("author@example.com");
        author.setFirstName("A");
        author.setLastName("User");
        Thread thread = Thread.builder().id(7L).title("Topic").createdBy(author).build();

        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        when(jwtUtil.extractEmail("token")).thenReturn(author.getEmail());
        when(userRepository.findByEmail(author.getEmail())).thenReturn(Optional.of(author));
        when(threadContentCleanupService.requireOwnedImageReference(null, 1L)).thenReturn(null);
        when(replyRepository.save(any(ThreadReply.class))).thenAnswer(invocation -> {
            ThreadReply reply = invocation.getArgument(0);
            reply.setId(9L);
            return reply;
        });
        when(topicSubscriptionService.subscriberIdsExcept(7L, 1L)).thenReturn(List.of(2L));

        service.addReply(ThreadReplyDto.builder().threadId(7L).content("Reply").build(),
                "Bearer token");

        verify(fanoutPublisher, never()).publishTopic(any(), any(), any(), any());
        for (TransactionSynchronization synchronization
                : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }
        verify(fanoutPublisher).publishTopic(
                eq(List.of(2L)), any(LocalizedText.class), any(LocalizedText.class), eq(7L));
    }
}
