package com.fyp.backend.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * The "new members are waiting for you" counter behind the admin badge.
 *
 * Registrations are the one thing that needs an admin's attention without any
 * admin having asked for it: a new account cannot chat or join anything until
 * someone verifies it, so an unnoticed sign-up is a person stuck at the door.
 *
 * The bookkeeping is one number per admin — the highest user id they have
 * already been shown ({@link User#getLastSeenMemberId()}). Ids are identity
 * generated and therefore strictly increasing, so "how many are new" is a single
 * comparison: no extra table, no timestamps, no per-admin rows.
 *
 * Kept apart from {@link UserService} because the push delivery path needs the
 * count at send time, to compose the icon badge, and reaching that through the
 * account-management service would tie delivery to it.
 */
@Service
@RequiredArgsConstructor
public class AdminAlertService {

    private static final Logger log = LoggerFactory.getLogger(AdminAlertService.class);

    private final UserRepository userRepository;

    /**
     * Gives every admin who has no marker yet the current high-water mark, so
     * they start on a clean slate rather than being greeted by a badge counting
     * the entire membership.
     *
     * Runs on every boot rather than once, because "no marker" also describes an
     * admin seeded by the admin tool. Promotion through the app is handled at the
     * point of promotion instead; see {@link #startTrackingNewMembers(User)}.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void backfillUnmarkedAdmins() {
        List<User> unmarked = userRepository.findByIsAdminTrueAndLastSeenMemberIdIsNull();
        if (unmarked.isEmpty()) return;

        long highest = userRepository.findHighestUserId();
        unmarked.forEach(admin -> admin.setLastSeenMemberId(highest));
        userRepository.saveAll(unmarked);
        log.info("New-member badge: started {} admin(s) from member #{}.", unmarked.size(), highest);
    }

    /**
     * Stamps a freshly promoted admin with today's high-water mark. Without this
     * they would carry a null marker until the next restart, and see no badge in
     * the meantime.
     */
    public void startTrackingNewMembers(User admin) {
        if (admin == null || !admin.isAdmin() || admin.getLastSeenMemberId() != null) return;
        admin.setLastSeenMemberId(userRepository.findHighestUserId());
    }

    /**
     * Accounts registered since this admin last looked.
     *
     * A null marker reports zero and writes nothing: this is read from the push
     * delivery path, where a silent write would consume the very sign-up the
     * push is announcing. Markers are established at startup and on promotion.
     */
    public long unseenNewMemberCount(Long adminId) {
        User admin = adminId == null ? null : userRepository.findById(adminId).orElse(null);
        return unseenNewMemberCountForUser(admin);
    }

    /** Same calculation when the caller already loaded the user in a batch. */
    public long unseenNewMemberCountForUser(User admin) {
        if (admin == null || !admin.isAdmin()) return 0;

        Long seen = admin.getLastSeenMemberId();
        if (seen == null) return 0;
        return userRepository.countByIdGreaterThanAndDeletedAccountFalseAndBotFalse(seen);
    }

    /**
     * Clears the badge, called when an admin opens the user list. The marker
     * moves to the newest account that exists right now: a registration landing
     * in the same instant is simply counted on the next look.
     */
    @Transactional
    public void markNewMembersSeen(Long adminId) {
        User admin = adminId == null ? null : userRepository.findById(adminId).orElse(null);
        if (admin == null || !admin.isAdmin()) return;

        admin.setLastSeenMemberId(userRepository.findHighestUserId());
        userRepository.save(admin);
    }

    /** Every admin who should be told about a new sign-up. */
    public List<Long> alertableAdminIds() {
        return userRepository.findAlertableAdminIds();
    }
}
