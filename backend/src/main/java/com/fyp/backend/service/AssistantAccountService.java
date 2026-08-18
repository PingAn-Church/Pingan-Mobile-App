package com.fyp.backend.service;

import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.UserRepository;

import lombok.RequiredArgsConstructor;

/**
 * The in-app assistant's account.
 *
 * It is an ordinary {@link User} row on purpose. {@code Message.sender} is a
 * non-null association, and MessageDto reads the sender's name and avatar off it,
 * so a machine account that is a real user gets message persistence, WebSocket
 * fan-out, avatars, history pagination, reporting and read-state for free. The
 * {@code bot} flag is what keeps it out of the places a person belongs.
 *
 * Seeding is idempotent and runs on every boot, the same way AppGroupChatService
 * reconciles its roster: cheap when nothing changed, and it heals drift rather
 * than depending on a one-time migration having been run.
 */
@Service
@RequiredArgsConstructor
public class AssistantAccountService {

    private static final Logger log = LoggerFactory.getLogger(AssistantAccountService.class);

    /**
     * Not a routable address. It only exists because email is non-null and unique;
     * nothing is ever sent here, and login is refused for bot rows regardless.
     */
    static final String ASSISTANT_EMAIL = "shalombot@assistant.pingan.invalid";

    /** English name. Rendered as-is: formatName falls back to whichever half is set. */
    static final String NAME_EN = "ShalomBot";

    /** Chinese name, shown to readers whose app language is Chinese. */
    static final String NAME_ZH = "平安小助手";

    private final UserRepository userRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Creates the assistant if it is missing and repairs it if it has drifted.
     *
     * Runs BEFORE AppGroupChatService's roster pass (which has no explicit order,
     * so it sits at lowest precedence). That ordering is what makes the assistant
     * appear in the app-level group on the very first boot of this build rather
     * than the second — reconcile() only adds accounts that already exist.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.HIGHEST_PRECEDENCE)
    @Transactional
    public void ensureAssistantAccount() {
        User assistant = userRepository.findByEmail(ASSISTANT_EMAIL).orElse(null);

        if (assistant == null) {
            assistant = new User();
            assistant.setEmail(ASSISTANT_EMAIL);
            // A hash of a value nobody holds. Login is already refused for bots;
            // this means there is also no password to guess if that check moves.
            assistant.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
            assistant.setFirstName(NAME_EN);
            // Blank rather than a placeholder: formatName returns `first || last`
            // when either side is empty, so the name renders with no stray space.
            assistant.setLastName("");
            log.info("Creating the in-app assistant account.");
        }

        // Verified and active, because findChatEligibleMembers gates on both and
        // the assistant has to stay on the app-level group's roster — a mention of
        // a non-participant is stripped before the message is stored.
        assistant.setBot(true);
        assistant.setDisplayNameZh(NAME_ZH);
        assistant.setVerifiedUser(true);
        assistant.setActive(true);
        assistant.setDeletedAccount(false);
        // Never an admin. Tool results are filtered by the requester's privileges,
        // so an admin assistant would publish admin-only content — unpublished
        // courses, reported threads — into a group where everyone can read it.
        assistant.setAdmin(false);
        assistant.setInstructor(false);
        // No stored avatar: the client draws the app icon for bot senders, which
        // avoids an OSS upload during seeding and keeps the icon in one place.
        assistant.setProfileImage(null);

        userRepository.save(assistant);
        requireNotAdmin(assistant);
    }

    /**
     * Warns about any group that has the assistant switched on but does not have it
     * on the roster.
     *
     * That combination is the feature's one silent failure: ChatService strips a
     * mention of a non-participant before the message is stored, so the assistant
     * simply never answers and nothing anywhere reports why. Runs last, after
     * AppGroupChatService has reconciled the app-level group's membership.
     */
    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.LOWEST_PRECEDENCE)
    @Transactional(readOnly = true)
    public void warnAboutGroupsMissingTheAssistant() {
        Long assistantId = assistantUserId().orElse(null);
        if (assistantId == null) {
            return;
        }
        for (GroupConversation group : groupConversationRepository.findByAssistantEnabledTrue()) {
            boolean present = group.getParticipants() != null && group.getParticipants().stream()
                    .anyMatch(participant -> assistantId.equals(participant.getId()));
            if (!present) {
                log.warn("Group {} has the assistant enabled but the assistant is not a "
                        + "participant, so mentions of it will be silently dropped. "
                        + "Toggle the assistant off and on again for that group.", group.getId());
            }
        }
    }

    /** The assistant's user row, or empty before the first startup pass has run. */
    public Optional<User> findAssistant() {
        return userRepository.findByEmail(ASSISTANT_EMAIL).filter(User::isBot);
    }

    public Optional<Long> assistantUserId() {
        return findAssistant().map(User::getId);
    }

    /**
     * Fails startup rather than letting an admin assistant reach a group chat.
     *
     * §5 of the integration plan: the tool layer enforces "only what every
     * participant could already read" by running as this account, so its
     * privilege level is the whole enforcement mechanism, not a detail.
     */
    static void requireNotAdmin(User assistant) {
        if (assistant.isAdmin()) {
            throw new IllegalStateException(
                    "The assistant account must not be an admin — its privileges decide what "
                            + "tool results are visible to a whole group. Resolve before starting.");
        }
    }
}
