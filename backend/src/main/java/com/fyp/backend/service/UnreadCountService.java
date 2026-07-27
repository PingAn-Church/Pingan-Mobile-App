package com.fyp.backend.service;

import org.springframework.stereotype.Service;

import com.fyp.backend.repository.MessageRepository;

import lombok.RequiredArgsConstructor;

/**
 * How many messages are waiting for a user across all of their conversations.
 *
 * This is the number the OS shows on the app icon, so it has to be resolvable at
 * push time — the app may not be running to count for itself. Kept as its own
 * collaborator rather than handing PushNotificationService a repository: the
 * delivery path stays about delivery, and tests can stub a count in one line.
 */
@Service
@RequiredArgsConstructor
public class UnreadCountService {

    private final MessageRepository messageRepository;

    /** Unread messages from other people, excluding muted conversations. */
    public long totalUnreadFor(Long userId) {
        if (userId == null) return 0;
        return messageRepository.countTotalUnread(userId);
    }
}
