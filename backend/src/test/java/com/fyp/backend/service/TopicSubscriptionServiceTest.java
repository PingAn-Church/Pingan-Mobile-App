package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.ThreadSubscription;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadSubscriptionRepository;

/**
 * Topics are silent unless somebody asks for them, and the read marker is what
 * keeps the badge honest. The awkward cases are joining a topic that already has
 * a hundred replies (which must not immediately look unread) and leaving one you
 * were never in.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TopicSubscriptionServiceTest {

    @Mock private ThreadSubscriptionRepository subscriptionRepository;
    @Mock private ThreadReplyRepository replyRepository;

    @InjectMocks private TopicSubscriptionService topicSubscriptionService;

    private static ThreadReply reply(long id) {
        ThreadReply r = new ThreadReply();
        r.setId(id);
        return r;
    }

    @Test
    void followingATopicStartsYouCaughtUpOnWhatIsAlreadyThere() {
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.empty());
        when(replyRepository.findTopByThreadIdOrderByIdDesc(7L)).thenReturn(Optional.of(reply(120L)));

        assertTrue(topicSubscriptionService.setSubscribed(7L, 3L, true));

        ArgumentCaptor<ThreadSubscription> saved = ArgumentCaptor.forClass(ThreadSubscription.class);
        verify(subscriptionRepository).save(saved.capture());
        // Joining a long-running topic must not show a badge for the hundred
        // replies posted before anyone was interested.
        assertEquals(120L, saved.getValue().getLastSeenReplyId());
    }

    @Test
    void followingATopicWithNoRepliesYetLeavesTheMarkerEmpty() {
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.empty());
        when(replyRepository.findTopByThreadIdOrderByIdDesc(7L)).thenReturn(Optional.empty());

        topicSubscriptionService.setSubscribed(7L, 3L, true);

        ArgumentCaptor<ThreadSubscription> saved = ArgumentCaptor.forClass(ThreadSubscription.class);
        verify(subscriptionRepository).save(saved.capture());
        assertEquals(null, saved.getValue().getLastSeenReplyId());
    }

    @Test
    void followingTwiceDoesNotResetTheReadMarker() {
        ThreadSubscription existing = new ThreadSubscription(7L, 3L, 40L);
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));

        assertTrue(topicSubscriptionService.setSubscribed(7L, 3L, true));

        verify(subscriptionRepository, never()).save(any(ThreadSubscription.class));
        assertEquals(40L, existing.getLastSeenReplyId());
    }

    @Test
    void unfollowingRemovesTheSubscription() {
        ThreadSubscription existing = new ThreadSubscription(7L, 3L, 40L);
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));

        assertFalse(topicSubscriptionService.setSubscribed(7L, 3L, false));

        verify(subscriptionRepository).delete(existing);
    }

    @Test
    void unfollowingSomethingYouNeverFollowedIsHarmless() {
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.empty());

        assertFalse(topicSubscriptionService.setSubscribed(7L, 3L, false));

        verify(subscriptionRepository, never()).delete(any(ThreadSubscription.class));
    }

    @Test
    void theAuthorIsSubscribedWithNoReadMarkerSoTheFirstReplyCounts() {
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.empty());

        topicSubscriptionService.subscribeAuthor(7L, 3L);

        ArgumentCaptor<ThreadSubscription> saved = ArgumentCaptor.forClass(ThreadSubscription.class);
        verify(subscriptionRepository).save(saved.capture());
        assertEquals(null, saved.getValue().getLastSeenReplyId());
        // A brand-new topic has nothing to be caught up on, so nothing is looked up.
        verify(replyRepository, never()).findTopByThreadIdOrderByIdDesc(any());
    }

    @Test
    void openingATopicMovesTheReadMarkerToItsNewestReply() {
        ThreadSubscription existing = new ThreadSubscription(7L, 3L, 40L);
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.of(existing));
        when(replyRepository.findTopByThreadIdOrderByIdDesc(7L)).thenReturn(Optional.of(reply(88L)));

        topicSubscriptionService.markSeen(7L, 3L);

        assertEquals(88L, existing.getLastSeenReplyId());
        verify(subscriptionRepository).save(existing);
    }

    @Test
    void openingATopicYouDoNotFollowChangesNothing() {
        when(subscriptionRepository.findByThreadIdAndUserId(7L, 3L)).thenReturn(Optional.empty());

        topicSubscriptionService.markSeen(7L, 3L);

        verify(subscriptionRepository, never()).save(any(ThreadSubscription.class));
    }

    @Test
    void theAuthorOfAReplyIsNotNotifiedAboutTheirOwnPost() {
        when(subscriptionRepository.findByThreadId(7L)).thenReturn(List.of(
                new ThreadSubscription(7L, 3L, null),
                new ThreadSubscription(7L, 5L, null)));

        assertEquals(List.of(5L), topicSubscriptionService.subscriberIdsExcept(7L, 3L));
    }
}
