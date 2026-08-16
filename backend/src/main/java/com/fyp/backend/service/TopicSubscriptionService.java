package com.fyp.backend.service;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.ThreadSubscription;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadSubscriptionRepository;

import lombok.RequiredArgsConstructor;

/**
 * Who hears about which topic.
 *
 * Topics are muted by default. A forum that notifies everybody about everything
 * gets silenced wholesale, so the bell is opt-in — with one exception: whoever
 * posted the topic is subscribed to it automatically, because they are the
 * person actually waiting for the answers.
 */
@Service
@RequiredArgsConstructor
public class TopicSubscriptionService {

    private final ThreadSubscriptionRepository subscriptionRepository;
    private final ThreadReplyRepository replyRepository;

    public boolean isSubscribed(Long threadId, Long userId) {
        if (threadId == null || userId == null) return false;
        return subscriptionRepository.findByThreadIdAndUserId(threadId, userId).isPresent();
    }

    public List<Long> subscribedThreadIds(Long userId) {
        return userId == null ? List.of() : subscriptionRepository.findThreadIdsByUserId(userId);
    }

    /** Everyone following a topic except the person who just posted in it. */
    public List<Long> subscriberIdsExcept(Long threadId, Long excludedUserId) {
        return subscriptionRepository.findByThreadId(threadId).stream()
                .map(ThreadSubscription::getUserId)
                .filter(id -> !id.equals(excludedUserId))
                .toList();
    }

    /**
     * Turns following on or off.
     *
     * A new subscription starts already caught up on what is there — following a
     * long-running topic should not immediately show a badge for a hundred
     * replies posted before you were interested.
     */
    @Transactional
    public boolean setSubscribed(Long threadId, Long userId, boolean subscribed) {
        Optional<ThreadSubscription> existing =
                subscriptionRepository.findByThreadIdAndUserId(threadId, userId);

        if (!subscribed) {
            existing.ifPresent(subscriptionRepository::delete);
            return false;
        }
        if (existing.isPresent()) return true;

        subscriptionRepository.save(
                new ThreadSubscription(threadId, userId, newestReplyId(threadId)));
        return true;
    }

    /**
     * Subscribes the author of a brand-new topic. Separate from setSubscribed so
     * the intent reads at the call site, and so it can never toggle anything off.
     */
    @Transactional
    public void subscribeAuthor(Long threadId, Long authorId) {
        if (threadId == null || authorId == null) return;
        if (subscriptionRepository.findByThreadIdAndUserId(threadId, authorId).isPresent()) return;
        subscriptionRepository.save(new ThreadSubscription(threadId, authorId, null));
    }

    /** Called when someone opens a topic: everything in it is now seen. */
    @Transactional
    public void markSeen(Long threadId, Long userId) {
        subscriptionRepository.findByThreadIdAndUserId(threadId, userId).ifPresent(subscription -> {
            subscription.setLastSeenReplyId(newestReplyId(threadId));
            subscriptionRepository.save(subscription);
        });
    }

    /** The number behind the badge on the Topics row in the chat list. */
    public long unseenReplyCount(Long userId) {
        return userId == null ? 0 : subscriptionRepository.countUnseenRepliesFor(userId);
    }

    /** Drops every subscription to a topic that no longer exists. */
    @Transactional
    public void forgetThread(Long threadId) {
        subscriptionRepository.deleteByThreadId(threadId);
    }

    private Long newestReplyId(Long threadId) {
        return replyRepository.findTopByThreadIdOrderByIdDesc(threadId)
                .map(ThreadReply::getId)
                .orElse(null);
    }
}
