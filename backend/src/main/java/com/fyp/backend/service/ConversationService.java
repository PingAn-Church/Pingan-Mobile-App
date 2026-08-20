package com.fyp.backend.service;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.GroupConversationDto;
import com.fyp.backend.dto.LastMessageDto;
import com.fyp.backend.dto.PrivateConversationDto;
import com.fyp.backend.dto.UserSummaryDto;
import com.fyp.backend.model.*;
import com.fyp.backend.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ConversationService {
    private static final int MEDIA_URL_PAGE_SIZE = 500;

    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OSSService ossService;
    private final MessageRepository messageRepository;
    private final MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    private final ConversationMuteRepository conversationMuteRepository;
    private final OssCleanupService ossCleanupService;
    private final ConversationReadStateService conversationReadStateService;
    private final AssistantAccountService assistantAccountService;

    @Autowired
    public ConversationService(GroupConversationRepository groupConversationRepository,
                               PrivateConversationRepository privateConversationRepository,
                               UserRepository userRepository,
                               SimpMessagingTemplate messagingTemplate,
                               OSSService ossService,
                               MessageRepository messageRepository,
                               MessageDeliveryStatusRepository messageDeliveryStatusRepository,
                               ConversationMuteRepository conversationMuteRepository,
                               OssCleanupService ossCleanupService,
                               ConversationReadStateService conversationReadStateService,
                               AssistantAccountService assistantAccountService) {
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
        this.ossService = ossService;
        this.messageRepository = messageRepository;
        this.messageDeliveryStatusRepository = messageDeliveryStatusRepository;
        this.conversationMuteRepository = conversationMuteRepository;
        this.ossCleanupService = ossCleanupService;
        this.conversationReadStateService = conversationReadStateService;
        this.assistantAccountService = assistantAccountService;
    }

    /**
     * Stamps the assistant's identity onto a conversation the client is about to
     * receive.
     *
     * Sent whether or not the assistant is currently on: the @ picker needs it to
     * offer the assistant, and the add-participants picker needs it to offer
     * turning the assistant ON, which is what adding it to the group now means.
     * The assistant is kept out of the user directory so it cannot appear in
     * "start a new chat" or the admin member lists, so this is the only way a
     * client learns it exists.
     */
    private ConversationDto withAssistantIdentity(ConversationDto dto) {
        if (dto == null) {
            return dto;
        }
        assistantAccountService.findAssistant().ifPresent(assistant -> {
            dto.setAssistantId(assistant.getId());
            dto.setAssistantName(assistant.getFirstName());
            dto.setAssistantNameZh(assistant.getDisplayNameZh());
        });
        return dto;
    }

    /**
     * Turns the in-app assistant on or off in the app-level group.
     *
     * Every other group switches the assistant on and off by adding and removing it
     * like any other member, which is the whole point: one act, so the flag and the
     * roster cannot disagree.
     *
     * The church-wide group cannot work that way. Its roster is derived from who is
     * verified and reconciled on every boot, and rejectAppGroupRosterEdit refuses
     * hand edits — the assistant is always a participant there. So its flag is the
     * only switch available, and this is it.
     */
    @Transactional
    public ConversationDto setAssistantEnabled(Long conversationId, boolean enabled, Long currentUserId) {
        GroupConversation group = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
        if (group.getAdmins() == null || group.getAdmins().stream()
                .noneMatch(admin -> admin.getId().equals(currentUserId))) {
            throw new AccessDeniedException("Only group admins can change the assistant.");
        }
        if (!group.isAppLevel()) {
            throw new IllegalArgumentException(
                    "Add or remove the assistant from this group's members instead.");
        }
        // No roster change: the assistant is chat-eligible, so the boot-time
        // reconcile keeps it on this group's participant list either way.
        assistantAccountService.findAssistant()
                .orElseThrow(() -> new IllegalStateException("The assistant account is not available."));

        group.setAssistantEnabled(enabled);
        group.setUpdatedAt(now());
        groupConversationRepository.save(group);
        return withAssistantIdentity(new ConversationDto(group));
    }

    /**
     * The app-level group's roster and admin list are derived from who is verified
     * and who is an app admin (see AppGroupChatService), so hand-editing either
     * would only be undone at the next reconcile — better to refuse outright than
     * to let a change appear to work and then silently revert.
     */
    private void rejectAppGroupRosterEdit(GroupConversation group) {
        if (group != null && group.isAppLevel()) {
            throw new IllegalArgumentException(
                    "Membership of the app-level group follows account verification and cannot be edited here.");
        }
    }

    private Timestamp now() {
        return new Timestamp(System.currentTimeMillis());
    }

    /**
     * Resolves a user who is about to be put into a conversation, refusing anyone
     * an admin has not verified.
     *
     * Chat is verified-only: the pickers already hide unverified accounts
     * (UserController#searchUsers) and the Social tab is gated on the same flag,
     * but both are presentation. A stale client, a cached list or a hand-made
     * request can still name a user by id, so every path that adds someone to a
     * conversation — private, group, or a later invite — resolves them here.
     *
     * Inactive and deleted accounts are refused for the same reason.
     */
    private User requireChatEligible(Long userId, String notFoundMessage) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException(notFoundMessage));
        if (!user.isVerifiedUser() || !user.isActive() || user.isDeletedAccount()) {
            throw new AccessDeniedException("Only admin-verified users can take part in chats.");
        }
        return user;
    }

    public Long getUserIdByEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found with email: " + email));
        return user.getId();
    }

    @Transactional
    public List<ConversationDto> getConversationsByUserId(Long userId) {
        List<ConversationDto> conversations = new ArrayList<>();

        // ✅ Fetch group conversations using the correct method
        groupConversationRepository.findByParticipantId(userId)
                .forEach(gc -> conversations.add(new ConversationDto(gc)));

        // ✅ Fetch private conversations using the correct method
        privateConversationRepository.findByUserId(userId)
                .forEach(pc -> conversations.add(new ConversationDto(pc)));

        // One lookup for every mute this user holds — matching on conversation id alone
        // is safe because ids are unique across group and private conversations, and it
        // avoids depending on how the stored conversation_type was cased.
        Set<Long> mutedConversationIds = conversationMuteRepository.findByUserId(userId)
                .stream()
                .map(ConversationMute::getConversationId)
                .collect(Collectors.toSet());

        // One query covers the whole list; being mentioned is rare enough that this
        // usually comes back empty.
        Set<Long> mentionedIn = new java.util.HashSet<>(
                messageRepository.findConversationIdsWithUnreadMention(userId));

        List<Long> conversationIds = conversations.stream()
                .map(ConversationDto::getConversationId)
                .collect(Collectors.toList());

        // Server-computed unread badges, one grouped query for the whole list —
        // this used to be a COUNT per conversation, which grew with every chat a
        // person belonged to. Conversations absent from the result have 0 unread.
        Map<Long, Long> unreadByConversation = new java.util.HashMap<>();
        if (!conversationIds.isEmpty()) {
            for (Object[] row : messageRepository.countUnreadByConversationIds(conversationIds, userId)) {
                unreadByConversation.put((Long) row[0], (Long) row[1]);
            }
        }

        // Newest message per conversation, batched the same way. This is what lets
        // the client draw list previews without prefetching a page of history for
        // every conversation on every start.
        Map<Long, Message> newestByConversation = new java.util.HashMap<>();
        if (!conversationIds.isEmpty()) {
            for (Message newest : messageRepository.findNewestPerConversation(conversationIds)) {
                // getId() on the conversation proxy reads the FK without initialising it.
                newestByConversation.put(newest.getConversation().getId(), newest);
            }
        }

        // Receipts, but only for the newest messages of PRIVATE conversations —
        // groups carry none by design (read state there is a watermark).
        Set<Long> privateConversationIds = conversations.stream()
                .filter(c -> "private".equals(c.getConversationType()))
                .map(ConversationDto::getConversationId)
                .collect(Collectors.toSet());
        List<Long> privateNewestMessageIds = newestByConversation.entrySet().stream()
                .filter(e -> privateConversationIds.contains(e.getKey()))
                .map(e -> e.getValue().getId())
                .collect(Collectors.toList());
        Map<Long, Map<String, String>> deliveryByMessage = new java.util.HashMap<>();
        if (!privateNewestMessageIds.isEmpty()) {
            for (MessageDeliveryStatus status : messageDeliveryStatusRepository
                    .findByMessageIdIn(privateNewestMessageIds)) {
                deliveryByMessage
                        .computeIfAbsent(status.getMessage().getId(), ignored -> new java.util.HashMap<>())
                        .put(String.valueOf(status.getUser().getId()), status.getStatus());
            }
        }

        // Reported-content masking in the previews follows the viewer, like history.
        User viewer = userRepository.findById(userId).orElse(null);

        for (ConversationDto c : conversations) {
            c.setUnreadCount(unreadByConversation.getOrDefault(c.getConversationId(), 0L));
            c.setMuted(mutedConversationIds.contains(c.getConversationId()));
            c.setMentioned(mentionedIn.contains(c.getConversationId()));
            Message newest = newestByConversation.get(c.getConversationId());
            if (newest != null) {
                c.setLastMessage(new LastMessageDto(newest, viewer,
                        deliveryByMessage.getOrDefault(newest.getId(), Map.of())));
            }
            // The app-level group ships no roster, so its size has to be counted
            // rather than read off a list that isn't there.
            if (c.isAppLevel()) {
                c.setParticipantCount(groupConversationRepository.countParticipants(c.getConversationId()));
            }
            withAssistantIdentity(c);
        }

        return conversations;
    }

    public ConversationDto getConversationById(Long conversationId) {
        Optional<GroupConversation> groupConversationOpt = groupConversationRepository.findById(conversationId);
        if (groupConversationOpt.isPresent()) {
            ConversationDto dto = withAssistantIdentity(new ConversationDto(groupConversationOpt.get()));
            if (dto.isAppLevel()) {
                dto.setParticipantCount(groupConversationRepository.countParticipants(conversationId));
            }
            return dto;
        }
        Optional<PrivateConversation> privateConversationOpt = privateConversationRepository.findById(conversationId);
        if (privateConversationOpt.isPresent()) {
            return new ConversationDto(privateConversationOpt.get());
        }
        throw new IllegalArgumentException("Conversation not found");
    }

    /**
     * One page of a group's members, sorted by name. Exists because the app-level
     * group's roster is deliberately absent from the conversation payload — this
     * is how the group details screen shows who is actually in it without the
     * chat list paying for several hundred profiles on every load.
     */
    @Transactional
    public Page<UserSummaryDto> getGroupParticipants(Long conversationId, Pageable pageable) {
        return groupConversationRepository.findParticipantsPage(conversationId, pageable)
                .map(UserSummaryDto::from);
    }

    public Conversation getConversationEntityById(Long conversationId) {
        Optional<GroupConversation> groupConversationOpt = groupConversationRepository.findById(conversationId);
        if (groupConversationOpt.isPresent()) {
            return groupConversationOpt.get();
        }
        Optional<PrivateConversation> privateConversationOpt = privateConversationRepository.findById(conversationId);
        if (privateConversationOpt.isPresent()) {
            return privateConversationOpt.get();
        }
        throw new IllegalArgumentException("Conversation not found");
    }

    public boolean isUserPartOfConversation(Long conversationId, Long userId) {
        // Counted rather than loaded: this runs on every history fetch and every
        // WebSocket subscription, and the app-level group's roster is the whole
        // church — materialising it just to answer yes/no is pure waste.
        if (groupConversationRepository.existsById(conversationId)) {
            return groupConversationRepository.isParticipant(conversationId, userId);
        }
        Optional<PrivateConversation> privateConversationOpt = privateConversationRepository.findById(conversationId);
        if (privateConversationOpt.isPresent()) {
            return privateConversationOpt.get().getParticipants().stream()
                    .anyMatch(u -> u.getId().equals(userId));
        }
        return false;
    }

    /**
     * Whether the user belongs to a group whose icon is the named object.
     *
     * Backwards compatibility for clients released before the group
     * download-signing endpoint took a conversationId: they ask for a group icon
     * by file name alone. The name embeds a server-generated UUID, so resolving
     * membership through it grants no more than passing the id would.
     */
    public boolean isUserInGroupWithIcon(String iconFileName, Long userId) {
        if (iconFileName == null || userId == null) {
            return false;
        }
        // Uploaded names are normalised to this alphabet, so anything else is not a
        // real object name — refuse it rather than let '%' match every group the
        // caller belongs to.
        if (!iconFileName.matches("[A-Za-z0-9._-]{1,255}")) {
            return false;
        }
        // '_' survives that check because it is legal in an object name, but it is
        // also a LIKE single-character wildcard, so it still has to be escaped.
        String escaped = iconFileName.replace("!", "!!").replace("_", "!_");
        return groupConversationRepository.isParticipantOfGroupWithIcon(userId, escaped);
    }

    public String getConversationType(Long conversationId) {
        if (groupConversationRepository.findById(conversationId).isPresent()) {
            return "group";
        }
        if (privateConversationRepository.findById(conversationId).isPresent()) {
            return "private";
        }
        throw new IllegalArgumentException("Conversation not found");
    }


    @Transactional
    public ConversationDto createGroupConversation(ConversationDto conversationDto, Long creatorId) {

        User creator = requireChatEligible(creatorId, "User not found");

        GroupConversation groupConversation = new GroupConversation();
        groupConversation.setGroupName(conversationDto.getGroupName());
        groupConversation.setGroupIcon(conversationDto.getGroupIcon());

        List<User> participants = new ArrayList<>();
        participants.add(creator);

        if (conversationDto.getParticipants() != null) {
            for (Long userId : conversationDto.getParticipants()) {
                participants.add(requireChatEligible(userId, "User not found"));
            }
        }

        groupConversation.setParticipants(participants);
        // Membership is the assistant's switch (see addParticipantToGroup). A group
        // born with the assistant on its roster must start switched on, or it lands
        // in the one state the feature cannot survive: on the roster but flagged
        // off, where every summons is refused without a trace.
        if (participants.stream().anyMatch(User::isBot)) {
            groupConversation.setAssistantEnabled(true);
        }
        groupConversation.setCreatedAt(now());
        groupConversation.setUpdatedAt(now());

        groupConversation = groupConversationRepository.save(groupConversation);

        groupConversation.setAdmins(new ArrayList<>());
        groupConversation.getAdmins().add(creator);
        groupConversationRepository.save(groupConversation);


        ConversationDto response = withAssistantIdentity(new ConversationDto(groupConversation));

        // ✅ DEFER NOTIFICATIONS
        GroupConversation finalGroupConversation = groupConversation;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                ConversationDto dto = withAssistantIdentity(new ConversationDto(finalGroupConversation));
                for (User user : finalGroupConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            user.getId().toString(),
                            "/queue/conversations",
                            dto
                    );
                }
            }
        });


        return response;
    }

    @Transactional
    public ConversationDto createPrivateConversation(ConversationDto conversationDto, Long creatorId) {
        // Validate creator
        User creator = requireChatEligible(creatorId, "User not found");

        // Check that only one other participant exists for a private conversation
        if (conversationDto.getParticipants() == null || conversationDto.getParticipants().size() != 1) {
            throw new IllegalArgumentException("Private conversation must have exactly one other participant.");
        }

        Long otherParticipantId = conversationDto.getParticipants().get(0);
        User otherUser = requireChatEligible(otherParticipantId, "Other participant not found");

        // One conversation per pair: if these two already have one, hand it back
        // instead of splitting their history across a duplicate. Both parties
        // already hold the conversation, so no WS announcement is re-sent. A race
        // between two simultaneous creates is caught by the unique pair index the
        // startup migration installs; per the pattern documented in
        // MessageRepository#existsByRespondsToMessageId, the violation is not
        // caught in-transaction — the client retries and then receives this branch.
        List<PrivateConversation> existing =
                privateConversationRepository.findByPair(creatorId, otherParticipantId);
        if (!existing.isEmpty()) {
            return new ConversationDto(existing.get(0));
        }

        // Create a private conversation
        PrivateConversation privateConversation = new PrivateConversation();
        privateConversation.setUserOne(creator);
        privateConversation.setUserTwo(otherUser);

        privateConversation.setCreatedAt(now());
        privateConversation.setUpdatedAt(now());

        privateConversation = privateConversationRepository.save(privateConversation);

        // Prepare the response DTO
        ConversationDto conversationDtoResponse = new ConversationDto(privateConversation);

        PrivateConversation finalPrivateConversation = privateConversation;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                ConversationDto dto = new ConversationDto(finalPrivateConversation);
                messagingTemplate.convertAndSendToUser(
                        creatorId.toString(), "/queue/conversations", dto
                );
                messagingTemplate.convertAndSendToUser(
                        otherParticipantId.toString(), "/queue/conversations", dto
                );
            }
        });

        return conversationDtoResponse;
    }

    @Transactional
    public ConversationDto addParticipantToGroup(Long conversationId, Long userId, Long currentUserId) {
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

        rejectAppGroupRosterEdit(groupConversation);

        User userToAdd = requireChatEligible(userId, "User not found");
        User currentUser = requireChatEligible(currentUserId, "Current user not found");

        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new AccessDeniedException("Only admins can add participants.");
        }

        if (groupConversation.getParticipants().contains(userToAdd)) {
            throw new IllegalArgumentException("User is already in the group.");
        }

        // ✅ Add new participant
        groupConversation.getParticipants().add(userToAdd);
        // Adding the assistant IS switching it on. Keeping a separate flag that an
        // admin had to set through a second call is what allowed the one state this
        // feature cannot survive: enabled but not on the roster, where ChatService
        // strips every mention before it is stored and nothing reports why.
        if (userToAdd.isBot()) {
            groupConversation.setAssistantEnabled(true);
        }
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        // Somebody joining now starts at the end of the conversation rather than
        // with every message ever sent in it marked unread.
        conversationReadStateService.markCaughtUp(conversationId, userId);

        // ✅ Prepare updated DTO
        ConversationDto updatedConversation = withAssistantIdentity(new ConversationDto(groupConversation));

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // ✅ Notify existing participants
                for (Long participantId : updatedConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(),
                            "/queue/participant-updates", updatedConversation
                    );
                }

                // ✅ Notify the newly added user
                messagingTemplate.convertAndSendToUser(
                        userId.toString(),
                        "/queue/conversations", updatedConversation
                );
            }
        });

        return updatedConversation;
    }

    @Transactional
    public ConversationDto removeParticipantFromGroup(Long conversationId, Long userId, Long currentUserId) {
        // Fetch the group conversation
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

        rejectAppGroupRosterEdit(groupConversation);

        // Fetch user being removed and the current admin
        User userToRemove = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("Current user not found"));

        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new AccessDeniedException("Only admins can remove participants.");
        }

        if (!groupConversation.getParticipants().contains(userToRemove)) {
            throw new IllegalArgumentException("User is not a participant in this group.");
        }

        if (userId.equals(currentUserId)) {
            throw new IllegalArgumentException("You cannot remove yourself from the group.");
        }

        // ✅ Remove the participant
        groupConversation.getParticipants().remove(userToRemove);
        // Taking the assistant out of the group IS switching it off — the mirror of
        // adding it. The two can no longer disagree because there is only one act.
        if (userToRemove.isBot()) {
            groupConversation.setAssistantEnabled(false);
        }
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        messageDeliveryStatusRepository.deleteByConversationIdAndUserId(conversationId, userId);
        conversationReadStateService.forget(conversationId, userId);

        // ✅ Build and notify
        ConversationDto updatedConversation = withAssistantIdentity(new ConversationDto(groupConversation));

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // Notify remaining participants
                for (Long participantId : updatedConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(),
                            "/queue/participant-updates", updatedConversation
                    );
                }

                // Notify removed participant
                messagingTemplate.convertAndSendToUser(
                        userId.toString(),
                        "/queue/conversations", updatedConversation
                );
            }
        });

        return updatedConversation;
    }



    @Transactional
    public ConversationDto leaveGroup(Long conversationId, Long currentUserId) {
        // Fetch the group conversation from the repository
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

        rejectAppGroupRosterEdit(groupConversation);

        // Fetch the current user
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Ensure the current user is part of the group
        if (!groupConversation.getParticipants().contains(currentUser)) {
            throw new IllegalArgumentException("User is not part of this group.");
        }

        // Inside leaveGroup method, before removing currentUser
        if (groupConversation.getAdmins().size() == 1 &&
                groupConversation.getAdmins().contains(currentUser)) {
            throw new IllegalArgumentException("You are the only admin. Please assign another admin before leaving the group.");
        }

        // Remove the current user from the participants list
        groupConversation.getParticipants().remove(currentUser);
        groupConversation.getAdmins().remove(currentUser);
        groupConversation.setUpdatedAt(now());

        // Save a copy of the participant list for notification after commit
        List<Long> remainingParticipantIds = groupConversation.getParticipants()
                .stream().map(User::getId).toList();

        // Case 1: Last participant left — delete the group
        if (groupConversation.getParticipants().isEmpty()) {
            performConversationCleanup(groupConversation);
            groupConversationRepository.delete(groupConversation);

            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    messagingTemplate.convertAndSendToUser(
                            currentUserId.toString(),
                            "/queue/conversations",
                            Map.of(
                                    "conversationId", conversationId,
                                    "deleted", true
                            )
                    );
                }
            });

            return null;
        }

        // Case 2: Others still in the group — update and notify
        groupConversationRepository.save(groupConversation);
        ConversationDto updatedConversation = withAssistantIdentity(new ConversationDto(groupConversation));

        // Defer notifications
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // Notify remaining participants
                for (Long participantId : remainingParticipantIds) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(),
                            "/queue/participant-updates", updatedConversation
                    );
                }

                // Notify the leaving user
                messagingTemplate.convertAndSendToUser(
                        currentUserId.toString(),
                        "/queue/conversations", updatedConversation
                );
            }
        });

        return updatedConversation;
    }

    // Add an admin to a group conversation
    @Transactional
    public ConversationDto addAdminToGroup(Long conversationId, Long userId, Long currentUserId) {
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

        rejectAppGroupRosterEdit(groupConversation);

        // Same eligibility bar as every other path that grants someone standing in
        // a conversation — an unverified or deactivated account cannot be promoted.
        User userToAdd = requireChatEligible(userId, "User not found");
        User currentUser = requireChatEligible(currentUserId, "Current user not found");

        // Ensure only admins can add new admins
        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new IllegalArgumentException("Only admins can add new admins.");
        }

        // Admin implies member: promoting an outsider would give them authority over
        // a group they cannot even read, and the roster fan-out would never reach them.
        if (!groupConversation.getParticipants().contains(userToAdd)) {
            throw new IllegalArgumentException("User must be a participant of the group before becoming an admin.");
        }

        // Prevent adding the same user as an admin
        if (groupConversation.getAdmins().contains(userToAdd)) {
            throw new IllegalArgumentException("User is already an admin.");
        }

        // Add the user to the admins list
        groupConversation.getAdmins().add(userToAdd);
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        // Prepare the updated conversation for response
        ConversationDto updatedConversation = withAssistantIdentity(new ConversationDto(groupConversation));

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // Notify all participants about the new admin (WebSocket)
                for (Long participantId : updatedConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(),
                            "/queue/group-admin-updates", updatedConversation
                    );
                }
            }
        });

        return updatedConversation;
    }

    @Transactional
    public ConversationDto removeAdminFromGroup(Long conversationId, Long userId, Long currentUserId) {
        // 🔍 Step 1: Fetch group conversation
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

        rejectAppGroupRosterEdit(groupConversation);

        // 🔍 Step 2: Fetch users
        User userToRemove = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("Current user not found"));

        // 🔐 Step 3: Validate permissions
        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new IllegalArgumentException("Only admins can remove other admins.");
        }

        if (!groupConversation.getAdmins().contains(userToRemove)) {
            throw new IllegalArgumentException("User is not an admin.");
        }

        if (groupConversation.getAdmins().size() == 1) {
            throw new IllegalArgumentException("Cannot remove the last admin from the group.");
        }

        if (userToRemove.getId().equals(currentUserId)) {
            throw new IllegalArgumentException("You cannot remove yourself as an admin.");
        }

        // ❌ Step 4: Remove user from admin list
        groupConversation.getAdmins().remove(userToRemove);
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        // 🛠️ Step 5: Prepare updated DTO
        ConversationDto updatedConversation = withAssistantIdentity(new ConversationDto(groupConversation));

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (Long participantId : updatedConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(),
                            "/queue/group-admin-updates",
                            updatedConversation
                    );
                }
            }
        });

        return updatedConversation;
    }

    @Transactional
    public ConversationDto updateGroupIcon(Long conversationId, String newGroupIconUrl, Long userId) {
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        if (!groupConversation.getAdmins().contains(user)) {
            throw new IllegalArgumentException("Only admins can update the group icon.");
        }

        String oldIcon = groupConversation.getGroupIcon();
        groupConversation.setGroupIcon(newGroupIconUrl);
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);
        if (!java.util.Objects.equals(oldIcon, newGroupIconUrl)) {
            ossCleanupService.deleteAfterCommit(oldIcon);
        }

        ConversationDto updated = withAssistantIdentity(new ConversationDto(groupConversation));

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (Long participantId : updated.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            participantId.toString(), "/queue/group-icon-updates", updated
                    );
                }
            }
        });

        return updated;
    }

    private void performConversationCleanup(Conversation conversation) {
        Long conversationId = conversation.getId();
        List<String> objectUrls = collectConversationMediaUrls(conversationId);

        if (conversation instanceof GroupConversation group) {
            addObjectUrl(objectUrls, group.getGroupIcon());
        }

        messageDeliveryStatusRepository.deleteByConversationId(conversationId);
        conversationReadStateService.forgetConversation(conversationId);
        messageRepository.deleteByConversationIdBulk(conversationId);
        deleteObjectsAfterCommit(objectUrls);
    }

    private List<String> collectConversationMediaUrls(Long conversationId) {
        List<String> urls = new ArrayList<>();
        int page = 0;
        List<String> batch;
        do {
            batch = messageRepository.findMediaContentsByConversationId(
                    conversationId, PageRequest.of(page++, MEDIA_URL_PAGE_SIZE));
            for (String content : batch) {
                addMessageMediaUrl(urls, content);
            }
        } while (batch.size() == MEDIA_URL_PAGE_SIZE);
        return urls;
    }

    private void addMessageMediaUrl(List<String> urls, String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        int sep = content.indexOf('|');
        addObjectUrl(urls, sep >= 0 ? content.substring(0, sep) : content);
    }

    private void addObjectUrl(List<String> urls, String url) {
        if (url != null && !url.isBlank()) {
            urls.add(url);
        }
    }

    private void deleteObjectsAfterCommit(List<String> objectUrls) {
        ossCleanupService.deleteAfterCommit(objectUrls);
    }


    @Transactional
    public void deleteConversation(Long conversationId, Long requestingUserId) {
        // ✅ Fully hydrated DTO
        ConversationDto conversationDto = getConversationById(conversationId);

        String conversationType = conversationDto.getConversationType();
        List<Long> participantIds = conversationDto.getParticipants();

        if ("private".equalsIgnoreCase(conversationType)) {
            if (!participantIds.contains(requestingUserId)) {
                throw new AccessDeniedException("You are not a participant in this private conversation.");
            }

            PrivateConversation privateConversation = privateConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));
            performConversationCleanup(privateConversation);
            privateConversationRepository.delete(privateConversation);

        } else if ("group".equalsIgnoreCase(conversationType)) {
            if (!conversationDto.getAdminIds().contains(requestingUserId)) {
                throw new AccessDeniedException("Only group admins can delete the conversation.");
            }

            GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Conversation not found"));

            if (groupConversation.isAppLevel()) {
                // It would be recreated empty on the next boot, minus every message.
                throw new IllegalArgumentException("The app-level group chat cannot be deleted.");
            }

            performConversationCleanup(groupConversation);
            groupConversation.getParticipants().clear();
            groupConversation.getAdmins().clear();
            groupConversationRepository.save(groupConversation);
            groupConversationRepository.delete(groupConversation);
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (Long userId : participantIds) {
                    messagingTemplate.convertAndSendToUser(
                            userId.toString(),
                            "/queue/conversations",
                            Map.of(
                                    "conversationId", conversationId,
                                    "deleted", true
                            )
                    );
                }
            }
        });

    }

}
