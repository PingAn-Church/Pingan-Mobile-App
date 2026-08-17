package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.ThreadSubscriptionRepository;

import lombok.RequiredArgsConstructor;

/**
 * Owns the database and OSS lifecycle of pictures attached to forum content.
 * Callers provide the transaction; OSS deletion is registered for after commit.
 */
@Service
@RequiredArgsConstructor
public class ThreadContentCleanupService {

    private static final String THREAD_PICTURES_PREFIX = "threadPictures/";

    private final ThreadRepository threadRepository;
    private final ThreadReplyRepository threadReplyRepository;
    private final ThreadSubscriptionRepository threadSubscriptionRepository;
    private final OssCleanupService ossCleanupService;

    /**
     * Accepts only a thread-picture object created for the supplied user.
     */
    public String requireOwnedImageReference(String value, Long ownerId) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (ownerId == null) {
            throw new IllegalArgumentException("A thread image must have an owner.");
        }

        String trimmed = value.trim();
        String clean = stripQueryAndFragment(trimmed).replace('\\', '/');
        String fileName = fileNameInsideThreadFolder(clean);
        if (fileName == null || !fileName.startsWith("u" + ownerId + "_")) {
            throw new IllegalArgumentException("The thread image does not belong to the author.");
        }
        return trimmed;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void cleanupReplacedReference(String previous, String current) {
        if (!sameReference(previous, current)) {
            ossCleanupService.deleteAfterCommit(previous);
        }
    }

    /** Deletes a thread, its replies and subscriptions in the caller's transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Long> deleteThread(Thread thread) {
        if (thread == null || thread.getId() == null) {
            return List.of();
        }

        Long threadId = thread.getId();
        List<Long> replyIds = threadReplyRepository.findIdsByThreadId(threadId);
        Collection<String> media = new ArrayList<>();
        media.add(thread.getCoverImage());
        media.addAll(threadReplyRepository.findImageUrlsByThreadId(threadId));

        threadSubscriptionRepository.deleteByThreadId(threadId);
        threadRepository.delete(thread);
        ossCleanupService.deleteAfterCommit(media);
        return List.copyOf(replyIds);
    }

    /** Missing content is already clean, which keeps moderation resolution idempotent. */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Long> deleteThreadById(Long threadId) {
        return threadRepository.findById(threadId)
                .map(this::deleteThread)
                .orElseGet(List::of);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteReply(ThreadReply reply) {
        if (reply == null || reply.getId() == null) {
            return;
        }
        String imageUrl = reply.getImageUrl();
        threadReplyRepository.delete(reply);
        ossCleanupService.deleteAfterCommit(imageUrl);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void deleteReplyById(Long replyId) {
        threadReplyRepository.findById(replyId).ifPresent(this::deleteReply);
    }

    private String fileNameInsideThreadFolder(String location) {
        int start;
        if (location.startsWith(THREAD_PICTURES_PREFIX)) {
            start = THREAD_PICTURES_PREFIX.length();
        } else {
            int marker = location.indexOf("/" + THREAD_PICTURES_PREFIX);
            if (marker < 0) {
                return null;
            }
            start = marker + THREAD_PICTURES_PREFIX.length() + 1;
        }

        String fileName = location.substring(start);
        return fileName.isBlank() || fileName.contains("/") ? null : fileName;
    }

    private String stripQueryAndFragment(String value) {
        int query = value.indexOf('?');
        int fragment = value.indexOf('#');
        int end = value.length();
        if (query >= 0) end = Math.min(end, query);
        if (fragment >= 0) end = Math.min(end, fragment);
        return value.substring(0, end);
    }

    private boolean sameReference(String left, String right) {
        return Objects.equals(trimToNull(left), trimToNull(right));
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }
}
