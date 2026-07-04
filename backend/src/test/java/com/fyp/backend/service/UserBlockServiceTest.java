package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.UserBlock;
import com.fyp.backend.repository.UserBlockRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Behaviour tests for user blocking. The invariants: no self-blocking,
 * idempotent block/unblock, and — critically — messaging stays blocked while a
 * block exists in EITHER direction (unblocking one side is not enough).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserBlockServiceTest {

    @Mock private UserBlockRepository userBlockRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private UserBlockService service;

    @Test
    void blockRejectsSelf() {
        assertThrows(IllegalArgumentException.class, () -> service.block(1L, 1L));
        verify(userBlockRepository, never()).save(any());
    }

    @Test
    void blockRejectsUnknownUser() {
        when(userRepository.existsById(2L)).thenReturn(false);
        assertThrows(IllegalArgumentException.class, () -> service.block(1L, 2L));
    }

    @Test
    void blockSavesOnceAndIsIdempotent() {
        when(userRepository.existsById(2L)).thenReturn(true);
        when(userBlockRepository.existsByBlockerIdAndBlockedId(1L, 2L)).thenReturn(false);

        service.block(1L, 2L);
        verify(userBlockRepository).save(any(UserBlock.class));

        // Second call: already blocked — no new row.
        when(userBlockRepository.existsByBlockerIdAndBlockedId(1L, 2L)).thenReturn(true);
        service.block(1L, 2L);
        verify(userBlockRepository, org.mockito.Mockito.times(1)).save(any(UserBlock.class));
    }

    @Test
    void unblockIsIdempotentWhenNoBlockExists() {
        when(userBlockRepository.findByBlockerIdAndBlockedId(1L, 2L)).thenReturn(Optional.empty());
        service.unblock(1L, 2L); // must not throw
        verify(userBlockRepository, never()).delete(any());
    }

    @Test
    void unblockDeletesExistingBlock() {
        UserBlock block = new UserBlock(1L, 2L);
        when(userBlockRepository.findByBlockerIdAndBlockedId(1L, 2L)).thenReturn(Optional.of(block));
        service.unblock(1L, 2L);
        verify(userBlockRepository).delete(block);
    }

    @Test
    void messagingBlockedInEitherDirection() {
        // I blocked them.
        when(userBlockRepository.existsByBlockerIdAndBlockedId(1L, 2L)).thenReturn(true);
        when(userBlockRepository.existsByBlockerIdAndBlockedId(2L, 1L)).thenReturn(false);
        assertTrue(service.isMessagingBlocked(1L, 2L));

        // They blocked me — still blocked even though I unblocked.
        when(userBlockRepository.existsByBlockerIdAndBlockedId(1L, 2L)).thenReturn(false);
        when(userBlockRepository.existsByBlockerIdAndBlockedId(2L, 1L)).thenReturn(true);
        assertTrue(service.isMessagingBlocked(1L, 2L));

        // Neither direction — messaging allowed.
        when(userBlockRepository.existsByBlockerIdAndBlockedId(2L, 1L)).thenReturn(false);
        assertFalse(service.isMessagingBlocked(1L, 2L));
    }

    @Test
    void statusReportsBothDirectionsAndCanMessage() {
        when(userBlockRepository.existsByBlockerIdAndBlockedId(1L, 2L)).thenReturn(false);
        when(userBlockRepository.existsByBlockerIdAndBlockedId(2L, 1L)).thenReturn(true);

        Map<String, Boolean> status = service.getStatus(1L, 2L);

        assertEquals(false, status.get("blockedByMe"));
        assertEquals(true, status.get("blockedMe"));
        assertEquals(false, status.get("canMessage"));
    }
}
