package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.model.User;

/**
 * Role changes reach the account they happened to, and only after they are real.
 *
 * The client is told to trust what arrives and swap it straight into its session,
 * so an announcement describing a transaction that then rolls back would leave
 * somebody holding privileges the database never granted.
 */
@ExtendWith(MockitoExtension.class)
class PermissionBroadcasterTest {

    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private PermissionBroadcaster permissionBroadcaster;

    @AfterEach
    void clearTransaction() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private User user(long id, boolean verified, boolean admin) {
        User u = new User();
        u.setId(id);
        u.setFirstName("A");
        u.setLastName("B");
        u.setEmail("a@example.com");
        u.setVerifiedUser(verified);
        u.setAdmin(admin);
        return u;
    }

    private void commit() {
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
    }

    @Test
    void nothingIsAnnouncedUntilTheChangeCommits() {
        TransactionSynchronizationManager.initSynchronization();

        permissionBroadcaster.announce(user(7L, true, false));

        // Still in flight — the grant could yet roll back.
        verifyNoInteractions(messagingTemplate);

        commit();
        verify(messagingTemplate).convertAndSendToUser(eq("7"), eq("/queue/permissions"), any(Object.class));
    }

    @Test
    void aRollbackAnnouncesNothing() {
        TransactionSynchronizationManager.initSynchronization();

        permissionBroadcaster.announce(user(7L, true, true));
        // afterCommit simply never runs.

        verify(messagingTemplate, never()).convertAndSendToUser(eq("7"), any(String.class), any(Object.class));
    }

    @Test
    void theWholeProfileTravelsSoTheClientNeedsNoRoundTrip() {
        TransactionSynchronizationManager.initSynchronization();

        permissionBroadcaster.announce(user(7L, true, true));
        commit();

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSendToUser(eq("7"), eq("/queue/permissions"), payload.capture());

        assertTrue(payload.getValue() instanceof UserProfileDto);
        UserProfileDto sent = (UserProfileDto) payload.getValue();
        assertEquals(7L, sent.getId());
        assertTrue(sent.isVerifiedUser());
        assertTrue(sent.isAdmin());
    }

    @Test
    void outsideATransactionItGoesStraightOut() {
        // Callers that change roles without a surrounding transaction still work.
        permissionBroadcaster.announce(user(7L, true, false));

        verify(messagingTemplate).convertAndSendToUser(eq("7"), eq("/queue/permissions"), any(Object.class));
    }

    @Test
    void anOfflineRecipientNeverBreaksTheChangeBeingAnnounced() {
        doThrow(new RuntimeException("no session"))
                .when(messagingTemplate).convertAndSendToUser(any(String.class), any(String.class), any(Object.class));

        assertDoesNotThrow(() -> permissionBroadcaster.announce(user(7L, true, false)));
    }

    @Test
    void aMissingUserIsIgnored() {
        assertDoesNotThrow(() -> permissionBroadcaster.announce(null));
        assertDoesNotThrow(() -> permissionBroadcaster.announce(new User()));

        verifyNoInteractions(messagingTemplate);
    }
}
