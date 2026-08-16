package com.fyp.backend.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * The one group chat the whole church is in.
 *
 * Unlike every other conversation, nobody creates or joins this one: membership
 * is derived from being admin-verified, so a new member finds it already waiting
 * in their chat list and cannot leave it. Muting is the way out of the noise.
 *
 * Membership is reconciled at startup and adjusted at the moment an account is
 * verified or un-verified. The startup pass is what makes the feature retroactive
 * — the group appears fully populated the first time this build runs, rather than
 * filling up one verification at a time.
 */
@Service
@RequiredArgsConstructor
public class AppGroupChatService {

    private static final Logger log = LoggerFactory.getLogger(AppGroupChatService.class);

    /** Seed names. Admins can rename both afterwards; these are only the starting point. */
    static final String DEFAULT_NAME_EN = "Pingan Group Chat";
    static final String DEFAULT_NAME_ZH = "平安教会公开群";

    private final GroupConversationRepository groupConversationRepository;
    private final UserRepository userRepository;

    /** The app-level group, or empty before the first startup pass has run. */
    public Optional<GroupConversation> findAppGroup() {
        return groupConversationRepository.findFirstByAppLevelTrue();
    }

    public Optional<Long> appGroupId() {
        return findAppGroup().map(GroupConversation::getId);
    }

    /** Whether a conversation id is the app-level group — used to refuse leave/remove. */
    public boolean isAppGroup(Long conversationId) {
        if (conversationId == null) return false;
        return appGroupId().map(id -> id.equals(conversationId)).orElse(false);
    }

    /**
     * Creates the group if it is missing, then brings its roster and admin list
     * back in line with who is actually verified and who is actually an app admin.
     *
     * Runs on every boot rather than once: it is cheap (two queries and a set
     * difference when nothing changed) and it heals any drift from a verification
     * that was applied while this service was down.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void ensureAppGroup() {
        GroupConversation group = findAppGroup().orElseGet(this::createAppGroup);
        reconcile(group);
    }

    private GroupConversation createAppGroup() {
        Timestamp now = Timestamp.from(Instant.now());
        GroupConversation group = new GroupConversation();
        group.setAppLevel(true);
        group.setGroupName(DEFAULT_NAME_EN);
        group.setGroupNameZh(DEFAULT_NAME_ZH);
        group.setParticipants(new ArrayList<>());
        group.setAdmins(new ArrayList<>());
        group.setCreatedAt(now);
        group.setUpdatedAt(now);
        GroupConversation saved = groupConversationRepository.save(group);
        log.info("Created the app-level group chat (conversation #{}).", saved.getId());
        return saved;
    }

    private void reconcile(GroupConversation group) {
        List<User> eligible = userRepository.findChatEligibleMembers();
        Set<Long> eligibleIds = eligible.stream().map(User::getId).collect(Collectors.toSet());

        List<User> participants = group.getParticipants() == null
                ? new ArrayList<>()
                : new ArrayList<>(group.getParticipants());
        Set<Long> currentIds = participants.stream().map(User::getId).collect(Collectors.toSet());

        boolean changed = participants.removeIf(u -> !eligibleIds.contains(u.getId()));
        for (User candidate : eligible) {
            if (!currentIds.contains(candidate.getId())) {
                participants.add(candidate);
                changed = true;
            }
        }

        // Group admin powers here follow app admin, not a per-group list somebody
        // could edit into an inconsistent state.
        List<User> appAdmins = eligible.stream().filter(User::isAdmin).collect(Collectors.toList());
        Set<Long> appAdminIds = appAdmins.stream().map(User::getId).collect(Collectors.toSet());
        Set<Long> groupAdminIds = group.getAdmins() == null
                ? new HashSet<>()
                : group.getAdmins().stream().map(User::getId).collect(Collectors.toSet());

        if (changed || !groupAdminIds.equals(appAdminIds)) {
            group.setParticipants(participants);
            group.setAdmins(appAdmins);
            group.setUpdatedAt(Timestamp.from(Instant.now()));
            groupConversationRepository.save(group);
            log.info("App-level group chat now has {} member(s) and {} admin(s).",
                    participants.size(), appAdmins.size());
        }
    }

    /**
     * Puts a member in or takes them out, following their verified status. Called
     * when an admin flips verification, so the group list updates for that person
     * without waiting for a restart.
     */
    @Transactional
    public void syncMembership(User user) {
        if (user == null) return;
        GroupConversation group = findAppGroup().orElse(null);
        if (group == null) return;

        boolean belongs = user.isVerifiedUser() && user.isActive() && !user.isDeletedAccount();
        List<User> participants = group.getParticipants() == null
                ? new ArrayList<>()
                : new ArrayList<>(group.getParticipants());
        boolean present = participants.stream().anyMatch(u -> u.getId().equals(user.getId()));

        if (belongs == present) return;
        if (belongs) {
            participants.add(user);
        } else {
            participants.removeIf(u -> u.getId().equals(user.getId()));
        }
        group.setParticipants(participants);
        group.setUpdatedAt(Timestamp.from(Instant.now()));
        groupConversationRepository.save(group);
    }

    /**
     * Mirrors an app-admin change onto the group's admin list, so a freshly
     * promoted admin can use @all here straight away rather than after a restart.
     */
    @Transactional
    public void syncAdmin(User user) {
        if (user == null) return;
        GroupConversation group = findAppGroup().orElse(null);
        if (group == null) return;

        List<User> admins = group.getAdmins() == null
                ? new ArrayList<>()
                : new ArrayList<>(group.getAdmins());
        boolean present = admins.stream().anyMatch(u -> u.getId().equals(user.getId()));
        boolean belongs = user.isAdmin() && user.isActive() && !user.isDeletedAccount();

        if (belongs == present) return;
        if (belongs) {
            admins.add(user);
        } else {
            admins.removeIf(u -> u.getId().equals(user.getId()));
        }
        group.setAdmins(admins);
        group.setUpdatedAt(Timestamp.from(Instant.now()));
        groupConversationRepository.save(group);
    }

    /**
     * Renames the group. Both names are required: leaving one blank would show
     * half the church an empty chat title.
     */
    @Transactional
    public GroupConversation rename(String nameEn, String nameZh) {
        GroupConversation group = findAppGroup()
                .orElseThrow(() -> new IllegalStateException("The app-level group chat does not exist yet."));

        String en = nameEn == null ? "" : nameEn.trim();
        String zh = nameZh == null ? "" : nameZh.trim();
        if (en.isEmpty() || zh.isEmpty()) {
            throw new IllegalArgumentException("Both the English and Chinese names are required.");
        }

        group.setGroupName(en);
        group.setGroupNameZh(zh);
        group.setUpdatedAt(Timestamp.from(Instant.now()));
        return groupConversationRepository.save(group);
    }
}
