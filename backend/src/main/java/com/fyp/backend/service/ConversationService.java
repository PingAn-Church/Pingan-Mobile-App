package com.fyp.backend.service;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.GroupConversationDto;
import com.fyp.backend.dto.PrivateConversationDto;
import com.fyp.backend.model.*;
import com.fyp.backend.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URL;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class ConversationService {

    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OSSService ossService;
    private final MessageRepository messageRepository;
    private final MessageDeliveryStatusRepository messageDeliveryStatusRepository;

    @Autowired
    public ConversationService(GroupConversationRepository groupConversationRepository,
                               PrivateConversationRepository privateConversationRepository,
                               UserRepository userRepository,
                               SimpMessagingTemplate messagingTemplate,
                               OSSService ossService,
                               MessageRepository messageRepository,
                               MessageDeliveryStatusRepository messageDeliveryStatusRepository) {
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
        this.ossService = ossService;
        this.messageRepository = messageRepository;
        this.messageDeliveryStatusRepository = messageDeliveryStatusRepository;
    }

    private Timestamp now() {
        return new Timestamp(System.currentTimeMillis());
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

        return conversations;
    }



    public ConversationDto getConversationById(Long conversationId) {
        Optional<GroupConversation> groupConversationOpt = groupConversationRepository.findById(conversationId);
        if (groupConversationOpt.isPresent()) {
            return new ConversationDto(groupConversationOpt.get());
        }
        Optional<PrivateConversation> privateConversationOpt = privateConversationRepository.findById(conversationId);
        if (privateConversationOpt.isPresent()) {
            return new ConversationDto(privateConversationOpt.get());
        }
        throw new IllegalArgumentException("Conversation not found");
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
        Optional<GroupConversation> groupConversationOpt = groupConversationRepository.findById(conversationId);
        if (groupConversationOpt.isPresent()) {
            return groupConversationOpt.get().getParticipants().stream()
                    .anyMatch(u -> u.getId().equals(userId));
        }
        Optional<PrivateConversation> privateConversationOpt = privateConversationRepository.findById(conversationId);
        if (privateConversationOpt.isPresent()) {
            return privateConversationOpt.get().getParticipants().stream()
                    .anyMatch(u -> u.getId().equals(userId));
        }
        return false;
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

//    @Transactional
//    public ConversationDto createGroupConversation(ConversationDto conversationDto, Long creatorId) {
//        // Validate creator
//        User creator = userRepository.findById(creatorId)
//                .orElseThrow(() -> new IllegalArgumentException("User not found"));
//
//        // Create new group conversation
//        GroupConversation groupConversation = new GroupConversation();
//        groupConversation.setGroupName(conversationDto.getGroupName());
//        groupConversation.setGroupIcon(conversationDto.getGroupIcon());
//
//        List<User> participants = new ArrayList<>();
//        participants.add(creator);
//
//        // Add other participants
//        if (conversationDto.getParticipants() != null) {
//            for (Long userId : conversationDto.getParticipants()) {
//                User user = userRepository.findById(userId)
//                        .orElseThrow(() -> new IllegalArgumentException("User not found"));
//                participants.add(user);
//            }
//        }
//
//        groupConversation.setParticipants(participants);
//        System.out.println("GROUP CONVO" + groupConversation);
//        groupConversation.setCreatedAt(now());
//        groupConversation.setUpdatedAt(now());
//
//        groupConversation = groupConversationRepository.save(groupConversation);
//
//        // Set creator as admin
//        groupConversation.setAdmins(new ArrayList<>());
//        groupConversation.getAdmins().add(creator);
//
//        groupConversationRepository.save(groupConversation);
//
//        // Prepare the response DTO
//        ConversationDto conversationDtoResponse = new ConversationDto(groupConversation);
//
//        System.out.println("FINAL Participants" + conversationDtoResponse);
//
//        // Notify participants
//        for (Long participantId : conversationDtoResponse.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), // Notify participants using their userId
//                    "/queue/conversations", conversationDtoResponse
//            );
//        }
//
//        return conversationDtoResponse;
//    }

    @Transactional
    public ConversationDto createGroupConversation(ConversationDto conversationDto, Long creatorId) {
        System.out.println("🚀 [GroupCreate] Request received for group: " + conversationDto.getGroupName());

        User creator = userRepository.findById(creatorId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        GroupConversation groupConversation = new GroupConversation();
        groupConversation.setGroupName(conversationDto.getGroupName());
        groupConversation.setGroupIcon(conversationDto.getGroupIcon());

        List<User> participants = new ArrayList<>();
        participants.add(creator);

        if (conversationDto.getParticipants() != null) {
            for (Long userId : conversationDto.getParticipants()) {
                User user = userRepository.findById(userId)
                        .orElseThrow(() -> new IllegalArgumentException("User not found"));
                participants.add(user);
            }
        }

        groupConversation.setParticipants(participants);
        groupConversation.setCreatedAt(now());
        groupConversation.setUpdatedAt(now());

        groupConversation = groupConversationRepository.save(groupConversation);
        System.out.println("✅ [GroupCreate] Group saved with ID = " + groupConversation.getId());

        groupConversation.setAdmins(new ArrayList<>());
        groupConversation.getAdmins().add(creator);
        groupConversationRepository.save(groupConversation);

        System.out.println("👥 [GroupCreate] Final participants in group: " +
                groupConversation.getParticipants().stream().map(User::getId).toList());

        ConversationDto response = new ConversationDto(groupConversation);

        // ✅ DEFER NOTIFICATIONS
        GroupConversation finalGroupConversation = groupConversation;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                ConversationDto dto = new ConversationDto(finalGroupConversation);
                for (User user : finalGroupConversation.getParticipants()) {
                    messagingTemplate.convertAndSendToUser(
                            user.getId().toString(),
                            "/queue/conversations",
                            dto
                    );
                }
            }
        });

        System.out.println("🧪 [GroupCreate] About to return. Persisted group ID = " + groupConversation.getId());
        System.out.println("🧪 [GroupCreate] Participants in saved entity: " +
                groupConversation.getParticipants().stream().map(User::getId).toList());

        return response;
    }


    @Transactional
    public ConversationDto createPrivateConversation(ConversationDto conversationDto, Long creatorId) {
        // Validate creator
        User creator = userRepository.findById(creatorId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Check that only one other participant exists for a private conversation
        if (conversationDto.getParticipants() == null || conversationDto.getParticipants().size() != 1) {
            throw new IllegalArgumentException("Private conversation must have exactly one other participant.");
        }

        Long otherParticipantId = conversationDto.getParticipants().get(0);
        User otherUser = userRepository.findById(otherParticipantId)
                .orElseThrow(() -> new IllegalArgumentException("Other participant not found"));

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

        User userToAdd = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("Current user not found"));

        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new AccessDeniedException("Only admins can add participants.");
        }

        if (groupConversation.getParticipants().contains(userToAdd)) {
            throw new IllegalArgumentException("User is already in the group.");
        }

        // ✅ Add new participant
        groupConversation.getParticipants().add(userToAdd);
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        // ✅ Add delivery statuses for existing messages
        List<Message> existingMessages = messageRepository.findByConversationId(conversationId);
        for (Message message : existingMessages) {
            // Skip messages sent by the user being added (shouldn't happen but just in case)
            if (!message.getSender().getId().equals(userId)) {
                MessageDeliveryStatus status = new MessageDeliveryStatus(
                        message,
                        userToAdd,
                        "SENT",
                        now()
                );
                messageDeliveryStatusRepository.save(status);
            }
        }

        // ✅ Prepare updated DTO
        ConversationDto updatedConversation = new ConversationDto(groupConversation);

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

//        // ✅ Notify existing participants
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/participant-updates", updatedConversation
//            );
//        }
//
//        // ✅ Notify the newly added user
//        messagingTemplate.convertAndSendToUser(
//                userId.toString(),
//                "/queue/conversations", updatedConversation
//        );

        return updatedConversation;
    }

    @Transactional
    public ConversationDto removeParticipantFromGroup(Long conversationId, Long userId, Long currentUserId) {
        // Fetch the group conversation
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

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
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        // ✅ Remove delivery statuses for the removed participant
        List<Message> messages = messageRepository.findByConversationId(conversationId);
        for (Message message : messages) {
            messageDeliveryStatusRepository.deleteByMessageIdAndUserId(message.getId(), userId);
        }

        // ✅ Build and notify
        ConversationDto updatedConversation = new ConversationDto(groupConversation);

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

//        // Notify remaining participants
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/participant-updates", updatedConversation
//            );
//        }
//
//        // Notify removed participant
//        messagingTemplate.convertAndSendToUser(
//                userId.toString(),
//                "/queue/conversations", updatedConversation
//        );

        return updatedConversation;
    }


//    @Transactional
//    public ConversationDto leaveGroup(Long conversationId, Long currentUserId) {
//        // Fetch the group conversation from the repository
//        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
//                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
//
//        // Fetch the current user
//        User currentUser = userRepository.findById(currentUserId)
//                .orElseThrow(() -> new IllegalArgumentException("User not found"));
//
//        // Ensure the current user is part of the group
//        if (!groupConversation.getParticipants().contains(currentUser)) {
//            throw new IllegalArgumentException("User is not part of this group.");
//        }
//
//        // Prevent the user from leaving if they are the only participant
//        if (groupConversation.getParticipants().size() == 1) {
//            throw new IllegalArgumentException("A group cannot exist with a single participant.");
//        }
//
//        // Remove the current user from the participants list
//        groupConversation.getParticipants().remove(currentUser);
//
//        // Save the updated conversation
//        groupConversationRepository.save(groupConversation);
//
//        // Prepare the updated conversation DTO for response
//        ConversationDto updatedConversation = new ConversationDto(groupConversation);
//
//        // Notify remaining participants about the participant removal
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/participant-updates", updatedConversation
//            );
//        }
//
//        // Notify the removed participant (current user) about their removal and updated conversation
//        messagingTemplate.convertAndSendToUser(
//                currentUserId.toString(),
//                "/queue/conversations", updatedConversation
//        );
//
//        return updatedConversation;
//    }

//    @Transactional
//    public ConversationDto leaveGroup(Long conversationId, Long currentUserId) {
//        // Fetch the group conversation from the repository
//        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
//                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
//
//        // Fetch the current user
//        User currentUser = userRepository.findById(currentUserId)
//                .orElseThrow(() -> new IllegalArgumentException("User not found"));
//
//        // Ensure the current user is part of the group
//        if (!groupConversation.getParticipants().contains(currentUser)) {
//            throw new IllegalArgumentException("User is not part of this group.");
//        }
//
//        // Remove the current user from the participants list
//        groupConversation.getParticipants().remove(currentUser);
//        groupConversation.getAdmins().remove(currentUser);
//
//        // Modify updatedAt
//        groupConversation.setUpdatedAt(now());
//
//        // ✅ Case 1: Last participant left — delete the group
//        if (groupConversation.getParticipants().isEmpty()) {
//            performConversationCleanup(groupConversation);
//            groupConversationRepository.delete(groupConversation);
//
//            // ✅ Notify the user and any previous participants
//            messagingTemplate.convertAndSendToUser(
//                    currentUserId.toString(),
//                    "/queue/conversations",
//                    Map.of(
//                            "conversationId", conversationId,
//                            "deleted", true
//                    )
//            );
//            return null;
//        }
//
//        // ✅ Case 2: Others still in the group — update and notify
//        groupConversationRepository.save(groupConversation);
//        ConversationDto updatedConversation = new ConversationDto(groupConversation);
//
//        // Notify remaining participants
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/participant-updates", updatedConversation
//            );
//        }
//
//        // Notify the leaving user (for cleanup on frontend)
//        messagingTemplate.convertAndSendToUser(
//                currentUserId.toString(),
//                "/queue/conversations", updatedConversation
//        );
//
//        return updatedConversation;
//    }

    @Transactional
    public ConversationDto leaveGroup(Long conversationId, Long currentUserId) {
        // Fetch the group conversation from the repository
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

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
        ConversationDto updatedConversation = new ConversationDto(groupConversation);

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

        User userToAdd = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        User currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("Current user not found"));

        // Ensure only admins can add new admins
        if (!groupConversation.getAdmins().contains(currentUser)) {
            throw new IllegalArgumentException("Only admins can add new admins.");
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
        ConversationDto updatedConversation = new ConversationDto(groupConversation);

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

        // Notify all participants about the new admin (WebSocket)
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/group-admin-updates", updatedConversation
//            );
//        }

        return updatedConversation;
    }

    @Transactional
    public ConversationDto removeAdminFromGroup(Long conversationId, Long userId, Long currentUserId) {
        // 🔍 Step 1: Fetch group conversation
        GroupConversation groupConversation = groupConversationRepository.findById(conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));

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
        ConversationDto updatedConversation = new ConversationDto(groupConversation);

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

        // 📡 Step 6: Notify all participants via WebSocket
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(),
//                    "/queue/group-admin-updates",
//                    updatedConversation
//            );
//        }

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

        // 🧹 Delete old image from OSS if it exists
        String oldIcon = groupConversation.getGroupIcon();
        if (oldIcon != null && !oldIcon.isBlank()) {
            try {
                String fileName = oldIcon.substring(oldIcon.lastIndexOf("/") + 1);
                ossService.deleteObject("groupProfilePictures/" + fileName);
            } catch (Exception e) {
                System.err.println("⚠️ Failed to delete old group icon: " + e.getMessage());
            }
        }

        groupConversation.setGroupIcon(newGroupIconUrl);
        groupConversation.setUpdatedAt(now());
        groupConversationRepository.save(groupConversation);

        ConversationDto updated = new ConversationDto(groupConversation);

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

//        for (Long participantId : updated.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/group-icon-updates", updated
//            );
//        }

        return updated;
    }

    private void performConversationCleanup(Conversation conversation) {
        // Remove the group icon from OSS so deleting a group doesn't leave it orphaned.
        if (conversation instanceof GroupConversation group) {
            ossService.deleteObjectByUrl(group.getGroupIcon());
        }

        List<Message> messages = messageRepository.findByConversationId(conversation.getId());

        for (Message message : messages) {
            // Delete delivery statuses
            List<MessageDeliveryStatus> statuses = messageDeliveryStatusRepository.findByMessageId(message.getId());
            messageDeliveryStatusRepository.deleteAll(statuses);

            // Delete OSS image if applicable
            if ("image".equalsIgnoreCase(message.getType())) {
                try {
                    String imageUrl = message.getContent();
                    String objectKey = extractObjectKeyFromUrl(imageUrl);
                    ossService.deleteObject(objectKey);
                } catch (Exception e) {
                    System.err.println("⚠️ Failed to delete image from OSS: " + e.getMessage());
                }
            }
        }

        // Delete messages
        messageRepository.deleteAll(messages);
    }

    private String extractObjectKeyFromUrl(String url) {
        try {
            URL parsedUrl = new URL(url);
            return parsedUrl.getPath().substring(1); // Removes leading "/"
        } catch (Exception e) {
            throw new RuntimeException("Invalid OSS URL format: " + url, e);
        }
    }



//    @Transactional
//    public void deleteConversation(Long conversationId, Long requestingUserId) {
//        Conversation conversation = getConversationEntityById(conversationId);
//
//        if (conversation instanceof PrivateConversation privateConversation) {
//            boolean isParticipant = privateConversation.getParticipants().stream()
//                    .anyMatch(user -> user.getId().equals(requestingUserId));
//            if (!isParticipant) {
//                throw new AccessDeniedException("You are not a participant in this private conversation.");
//            }
//
//            performConversationCleanup(privateConversation);
//            privateConversationRepository.delete(privateConversation);
//
//        } else if (conversation instanceof GroupConversation groupConversation) {
//            boolean isAdmin = groupConversation.getAdmins().stream()
//                    .anyMatch(admin -> admin.getId().equals(requestingUserId));
//            if (!isAdmin) {
//                throw new AccessDeniedException("Only group admins can delete the conversation.");
//            }
//
//            performConversationCleanup(groupConversation);
//
//            groupConversation.getParticipants().clear();
//            groupConversation.getAdmins().clear();
//            groupConversationRepository.save(groupConversation); // Ensures join table cleanup
//
//            groupConversationRepository.delete(groupConversation);
//
//            System.out.println("DELETION 1");
//
//        } else {
//            throw new IllegalArgumentException("Unknown conversation type.");
//        }
//
//        System.out.println("CHECKPOINT 2" + conversation.getParticipants());
//
//        for (User participant : conversation.getParticipants()) {
////            messagingTemplate.convertAndSendToUser(
////                    participant.getId().toString(),
////                    "/queue/conversation-deleted",
////                    conversationId
////            );
//            System.out.println("SENDING DELETION INFO");
//            messagingTemplate.convertAndSendToUser(
//                    participant.getId().toString(),
//                    "/queue/conversations",
//                    Map.of(
//                            "conversationId", conversationId,
//                            "deleted", true
//                    )
//            );
//
//        }
//    }

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

        // ✅ Notify all participants via /queue/conversations
//        for (Long userId : participantIds) {
//            messagingTemplate.convertAndSendToUser(
//                    userId.toString(),
//                    "/queue/conversations",
//                    Map.of(
//                            "conversationId", conversationId,
//                            "deleted", true
//                    )
//            );
//        }
    }


}
