package com.fyp.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.UserBlock;
import com.fyp.backend.repository.UserBlockRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * User-to-user blocking. Blocks are directional rows; private messaging is
 * refused while a block exists in either direction (see ChatService). Blocking
 * is idempotent — re-blocking an already-blocked user is a no-op, so the UI
 * never has to care about double taps or races.
 */
@Service
public class UserBlockService {

    private final UserBlockRepository userBlockRepository;
    private final UserRepository userRepository;

    public UserBlockService(UserBlockRepository userBlockRepository, UserRepository userRepository) {
        this.userBlockRepository = userBlockRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public void block(Long blockerId, Long blockedId) {
        if (blockerId.equals(blockedId)) {
            throw new IllegalArgumentException("You cannot block yourself.");
        }
        if (!userRepository.existsById(blockedId)) {
            throw new IllegalArgumentException("User not found.");
        }
        if (userBlockRepository.existsByBlockerIdAndBlockedId(blockerId, blockedId)) {
            return; // already blocked — idempotent
        }
        userBlockRepository.save(new UserBlock(blockerId, blockedId));
    }

    @Transactional
    public void unblock(Long blockerId, Long blockedId) {
        userBlockRepository.findByBlockerIdAndBlockedId(blockerId, blockedId)
                .ifPresent(userBlockRepository::delete); // idempotent
    }

    /** IDs of every user the given user has blocked. */
    public List<Long> getBlockedIds(Long blockerId) {
        return userBlockRepository.findAllByBlockerId(blockerId).stream()
                .map(UserBlock::getBlockedId)
                .toList();
    }

    /**
     * Both directions of the block relationship between me and another user.
     * blockedByMe drives the Block/Unblock button; canMessage mutes the
     * composer when a block exists in either direction.
     */
    public Map<String, Boolean> getStatus(Long meId, Long otherId) {
        boolean blockedByMe = userBlockRepository.existsByBlockerIdAndBlockedId(meId, otherId);
        boolean blockedMe = userBlockRepository.existsByBlockerIdAndBlockedId(otherId, meId);
        return Map.of(
                "blockedByMe", blockedByMe,
                "blockedMe", blockedMe,
                "canMessage", !blockedByMe && !blockedMe);
    }

    /** True when a block exists in either direction between the two users. */
    public boolean isMessagingBlocked(Long userA, Long userB) {
        return userBlockRepository.existsByBlockerIdAndBlockedId(userA, userB)
                || userBlockRepository.existsByBlockerIdAndBlockedId(userB, userA);
    }
}
