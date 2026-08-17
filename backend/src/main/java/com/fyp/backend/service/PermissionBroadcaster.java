package com.fyp.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.model.User;

import lombok.RequiredArgsConstructor;

/**
 * Tells one account, over its own socket, that its roles just changed.
 *
 * Verification, admin, instructor and active status all gate what the app will
 * even render, so until this existed the only way to learn about a change was to
 * ask again on a timer — every signed-in client, every minute, almost always to
 * be told nothing had happened. Pushing instead means one message to one person
 * at the moment an admin actually clicks something.
 *
 * The whole profile travels, not a nudge to go and refetch: it is the same shape
 * GET /api/users/profile returns, so the client can swap it straight in without
 * a round trip.
 */
@Service
@RequiredArgsConstructor
public class PermissionBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(PermissionBroadcaster.class);

    static final String DESTINATION = "/queue/permissions";

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Announces a role change to the account it happened to.
     *
     * Deferred to after commit: the client is told to trust what it receives, so
     * it must never arrive describing a transaction that then rolls back. The DTO
     * is built now, while the entity is still attached.
     */
    public void announce(User user) {
        if (user == null || user.getId() == null) return;

        Long userId = user.getId();
        UserProfileDto profile = UserProfileDto.from(user);

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send(userId, profile);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send(userId, profile);
            }
        });
    }

    private void send(Long userId, UserProfileDto profile) {
        try {
            messagingTemplate.convertAndSendToUser(String.valueOf(userId), DESTINATION, profile);
        } catch (Exception e) {
            // The account is offline, or the socket died between commit and send.
            // Either way the client picks the change up when it next foregrounds;
            // a failed announcement must not undo the change it was announcing.
            log.warn("Could not announce a permission change to user {}: {}", userId, e.getMessage());
        }
    }
}
