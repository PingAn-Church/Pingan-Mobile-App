package com.fyp.backend.service;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.exception.ContentUnderReviewException;
import com.fyp.backend.model.*;
import com.fyp.backend.mq.MessagePublisher;
import com.fyp.backend.repository.*;
import com.fyp.backend.util.Pagination;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private final MessageRepository messageRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;
    private final UserRepository userRepository;
    private final MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OssCleanupService ossCleanupService;
    private final RedisService redisService;
    private final MessagePublisher messagePublisher;
    private final PushNotificationService pushNotificationService;
    private final UserBlockService userBlockService;
    private final ContentSanitizer contentSanitizer;
    private final PushMessages pushMessages;

    @Autowired
    public ChatService(MessageRepository messageRepository,
                       GroupConversationRepository groupConversationRepository,
                       PrivateConversationRepository privateConversationRepository,
                       UserRepository userRepository,
                       MessageDeliveryStatusRepository messageDeliveryStatusRepository, SimpMessagingTemplate messagingTemplate,
                       OssCleanupService ossCleanupService,
                       RedisService redisService,
                       MessagePublisher messagePublisher,
                       PushNotificationService pushNotificationService,
                       UserBlockService userBlockService,
                       ContentSanitizer contentSanitizer,
                       PushMessages pushMessages) {
        this.messageRepository = messageRepository;
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
        this.userRepository = userRepository;
        this.messageDeliveryStatusRepository = messageDeliveryStatusRepository;
        this.messagingTemplate = messagingTemplate;
        this.ossCleanupService = ossCleanupService;
        this.redisService = redisService;
        this.messagePublisher = messagePublisher;
        this.pushNotificationService = pushNotificationService;
        this.userBlockService = userBlockService;
        this.contentSanitizer = contentSanitizer;
        this.pushMessages = pushMessages;
    }

    private Conversation getConversationByTypeAndId(Long conversationId, String conversationType) {
        if ("group".equals(conversationType)) {
            return groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
        } else if ("private".equals(conversationType)) {
            return privateConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Private conversation not found"));
        } else {
            throw new IllegalArgumentException("Invalid conversation type");
        }
    }


    private User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void checkUserIsParticipant(Conversation conversation, Long userId) {
        boolean isParticipant = conversation.getParticipants()
                .stream()
                .anyMatch(user -> user.getId().equals(userId));
        if (!isParticipant) {
            throw new IllegalArgumentException("User is not part of this conversation");
        }
    }

    private void createDeliveryStatuses(Conversation conversation, User sender, Message message, Timestamp timestamp) {
        List<User> recipients = conversation.getParticipants()
                .stream()
                .filter(user -> !user.getId().equals(sender.getId()))
                .toList();

        List<MessageDeliveryStatus> deliveryStatuses = new ArrayList<>();
        for (User recipient : recipients) {
            MessageDeliveryStatus deliveryStatus = new MessageDeliveryStatus(message, recipient, "SENT", timestamp);
            deliveryStatuses.add(deliveryStatus);
            messageDeliveryStatusRepository.save(deliveryStatus);
        }

        message.setDeliveryStatuses(deliveryStatuses);
        messageRepository.save(message);  // Save again to update delivery statuses
    }

    private MessageDto buildResponseDto(Message message, Conversation conversation) {
        MessageDto responseDto = new MessageDto(message);
        // Recipients exclude the sender — the fan-out echoes to the sender's queue
        // separately, and the sender must never be push-notified for their own message.
        List<Long> recipientIds = conversation.getParticipants().stream()
                .map(User::getId)
                .filter(id -> !id.equals(message.getSender().getId()))
                .collect(Collectors.toList());
        responseDto.setRecipientIds(recipientIds);
        return responseDto;
    }

    private MessageDeliveryStatus getDeliveryStatus(Long messageId, Long userId) {
        return messageDeliveryStatusRepository.findByMessageId(messageId)
                .stream()
                .filter(ds -> ds.getUser().getId().equals(userId))
                .findFirst()
                .orElse(null);
    }

    /**
     * Cursor-paginated chat history, newest-first internally but returned oldest->newest
     * for natural rendering. `before` is the smallest message id already loaded (null for
     * the first page). Returns { messages, nextCursor, hasMore }.
     */
    public Map<String, Object> getChatHistoryPage(Long conversationId, String conversationType,
            Long userId, Long before, int size) {
        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);
        checkUserIsParticipant(conversation, userId);

        int safeSize = Pagination.clampSize(size, 100);
        Pageable pageable = PageRequest.of(0, safeSize);

        List<Message> desc = (before == null)
                ? messageRepository.findByConversationIdOrderByIdDesc(conversationId, pageable)
                : messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(conversationId, before, pageable);

        boolean hasMore = desc.size() == safeSize;
        Long nextCursor = desc.isEmpty() ? null : desc.get(desc.size() - 1).getId();

        List<Message> ascending = new ArrayList<>(desc);
        Collections.reverse(ascending);
        User viewer = getUserById(userId);
        List<MessageDto> messages = ascending.stream()
                .map(message -> new MessageDto(message, viewer))
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("messages", messages);
        result.put("nextCursor", nextCursor);
        result.put("hasMore", hasMore);
        return result;
    }


    private List<String> getDestination(String conversationType, MessageDto savedMessage) {
        List<String> destinations = new ArrayList<>();

        if ("group".equals(conversationType)) {
            // For group conversations, send to the conversation topic
            destinations.add("/topic/conversation-" + savedMessage.getConversationId());
        } else if ("private".equals(conversationType)) {
            // For private conversations, send to both the sender and each recipient
            destinations.add("/user/" + savedMessage.getSenderId() + "/queue/messages"); // To the sender

            // To the recipients
            for (Long recipientId : savedMessage.getRecipientIds()) {
                destinations.add("/user/" + recipientId + "/queue/messages");
            }
        }

        return destinations;
    }

    public void broadcastMessageAfterCommit(Message message) {
        MessageDto dto = new MessageDto(message);
        List<String> destinations = getDestination(message.getConversationType(), dto);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, dto);
                }
            }
        });
    }

    /**
     * The push title, resolved per recipient. A private chat shows the sender's
     * name in the reader's own name order (Chinese puts the family name first);
     * a group shows its name, which is the same for everyone. Both are read here,
     * inside the transaction, so the deferred send never touches a detached entity.
     */
    private LocalizedText getPushNotificationTitle(String conversationType, User sender, Long conversationId) {
        if ("private".equals(conversationType)) {
            return pushMessages.personName(sender.getFirstName(), sender.getLastName());
        } else if ("group".equals(conversationType)) {
            GroupConversation group = groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new RuntimeException("Group conversation not found"));
            return pushMessages.literal(group.getGroupName());
        }
        return pushMessages.text("push.chat.newMessage");
    }

    /**
     * The push body. Text messages carry the sender's own words through
     * untouched; the media placeholders are ours to write, so they follow the
     * recipient's language.
     */
    private LocalizedText getPushNotificationBody(MessageDto messageDto) {
        if (messageDto == null) {
            return pushMessages.text("push.chat.newMessage");
        }

        String messageType = messageDto.getType() == null ? "" : messageDto.getType().trim().toLowerCase();
        return switch (messageType) {
            case "voice" -> pushMessages.text("push.chat.voice");
            case "image" -> pushMessages.text("push.chat.photo");
            default -> {
                String content = messageDto.getContent();
                yield (content == null || content.trim().isEmpty())
                        ? pushMessages.text("push.chat.newMessage")
                        : pushMessages.literal(content);
            }
        };
    }

    @Transactional
    public MessageDto sendMessageAndBroadcast(MessageDto messageDto, String conversationType) {
        Conversation conversation = getConversationByTypeAndId(messageDto.getConversationId(), conversationType);
        User sender = getUserById(messageDto.getSenderId());
        checkUserIsParticipant(conversation, sender.getId());

        // Server-side block enforcement (the client mutes its composer, but that's
        // cosmetic): private messages are refused while either participant blocks
        // the other. Group messages are unaffected by design.
        if ("private".equals(conversationType)) {
            Long otherId = conversation.getParticipants().stream()
                    .map(User::getId)
                    .filter(id -> !id.equals(sender.getId()))
                    .findFirst()
                    .orElse(null);
            if (otherId != null && userBlockService.isMessagingBlocked(sender.getId(), otherId)) {
                throw new IllegalArgumentException("Messaging is unavailable — one of you has blocked the other.");
            }
        }

        // Objectionable-word filter — only text bodies; voice/image content is a media URL.
        if (!"voice".equalsIgnoreCase(messageDto.getType()) && !"image".equalsIgnoreCase(messageDto.getType())) {
            messageDto.setContent(contentSanitizer.mask(messageDto.getContent()));
        }

        Timestamp timestamp = new Timestamp(System.currentTimeMillis());
        Message message = new Message(messageDto, conversation, sender, timestamp.toString());
        message = messageRepository.save(message);

        createDeliveryStatuses(conversation, sender, message, timestamp);

        MessageDto savedMessage = buildResponseDto(message, conversation);
        LocalizedText notificationTitle = getPushNotificationTitle(conversationType, sender, savedMessage.getConversationId());
        LocalizedText notificationBody = getPushNotificationBody(savedMessage);

        // ✅ Defer messaging and notifications. Each recipient is isolated so a
        // Redis/RabbitMQ hiccup for one user cannot silently skip the rest of
        // the fan-out (the message row is already committed at this point).
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (Long recipientId : savedMessage.getRecipientIds()) {
                    try {
                        String email = userRepository.findById(recipientId).map(User::getEmail).orElse(null);
                        if (email == null) continue;

                        boolean online;
                        try {
                            online = redisService.isUserOnlineAnywhere(email);
                        } catch (Exception redisDown) {
                            // Presence unknown — deliver over the live socket; push covers offline.
                            online = true;
                        }

                        if (online) {
                            messagingTemplate.convertAndSend("/user/" + recipientId + "/queue/messages", savedMessage);
                        } else {
                            messagePublisher.queueMessage(email, savedMessage);
                        }
                    } catch (Exception e) {
                        System.err.println("❌ Failed to fan out message " + savedMessage.getMessageId()
                                + " to user " + recipientId + ": " + e.getMessage());
                    }
                }

                // Always notify sender
                try {
                    messagingTemplate.convertAndSend("/user/" + savedMessage.getSenderId() + "/queue/messages", savedMessage);
                } catch (Exception e) {
                    System.err.println("❌ Failed to echo message to sender: " + e.getMessage());
                }

                // Push Notification
                try {
                    pushNotificationService.sendPushNotification(
                            savedMessage.getRecipientIds(),
                            notificationBody,
                            notificationTitle,
                            savedMessage.getConversationId(),
                            conversationType
                    );
                } catch (Exception e) {
                    System.err.println("❌ Failed to send push notifications: " + e.getMessage());
                }
            }
        });

        return savedMessage;
    }

    @Transactional
    public String updateMessageStatusAuthorized(Long messageId, Long conversationId, Long userId, String status) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        if (!conversationId.equals(message.getConversation().getId())) {
            throw new IllegalArgumentException("Message does not belong to this conversation");
        }
        checkUserIsParticipant(message.getConversation(), userId);

        MessageDeliveryStatus deliveryStatus = getDeliveryStatus(messageId, userId);
        if (deliveryStatus == null) {
            throw new IllegalArgumentException("No delivery status exists for this user");
        }
        deliveryStatus.setStatus(status);
        deliveryStatus.setTimestamp(new Timestamp(System.currentTimeMillis()));
        messageDeliveryStatusRepository.save(deliveryStatus);
        return message.getConversationType();
    }

    /**
     * Marks every message in a conversation as read for one user.
     *
     * The client's per-message receipts only cover the history page it has loaded
     * (the newest 30), so opening a conversation with hundreds of unread left the
     * rest unread on the server: the badge cleared locally and then reappeared on
     * the next refetch. This clears the whole conversation in one go.
     *
     * @return the user's remaining unread in this conversation — zero unless
     *         something arrived mid-flight.
     */
    @Transactional
    public long markConversationRead(Long userId, Long conversationId, String conversationType) {
        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);
        checkUserIsParticipant(conversation, userId);

        // Anyone added to a group after a message was sent has no delivery row for
        // it, and updateMessageStatus only ever touches rows that already exist —
        // so backfill first, then flip. Same pairing as ConversationService uses
        // when adding a participant.
        messageDeliveryStatusRepository.insertSentStatusesForConversation(conversationId, userId);
        messageDeliveryStatusRepository.markConversationRead(conversationId, userId);

        return messageRepository.countUnread(conversationId, userId);
    }


    public List<User> getConversationParticipants(Long conversationId, String conversationType) {
        if ("group".equalsIgnoreCase(conversationType)) {
            return groupConversationRepository.findById(conversationId)
                    .map(GroupConversation::getParticipants)
                    .orElse(new ArrayList<>());
        } else if ("private".equalsIgnoreCase(conversationType)) {
            return privateConversationRepository.findById(conversationId)
                    .map(PrivateConversation::getParticipants)
                    .orElse(new ArrayList<>());
        }
        throw new IllegalArgumentException("Invalid conversation type");
    }



    public Message saveMessage(MessageDto messageDto, Conversation conversation, User sender, String conversationType) {
        String timestampStr = java.time.LocalDateTime.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        Message message;
        if (messageDto.getMessageId() != null) {
            // Editing an existing message
            message = messageRepository.findById(messageDto.getMessageId())
                    .orElseThrow(() -> new IllegalArgumentException("Message not found"));
            message.setContent(messageDto.getContent());
            message.setTimestamp(Timestamp.valueOf(timestampStr));
        } else {
            // Creating a new message with conversationType
            message = new Message(messageDto, conversation, sender, timestampStr);
            message.setConversationType(conversationType);  // ✅ Ensure conversationType is set
        }
        return messageRepository.save(message);
    }

    @Transactional
    public MessageDto editMessageAndBroadcast(Long messageId, String newContent, String conversationType, Long loggedInUserId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!message.getSender().getId().equals(loggedInUserId)) {
            throw new IllegalArgumentException("You can only edit your own messages.");
        }

        if ("image".equalsIgnoreCase(message.getType())) {
            throw new IllegalArgumentException("Image messages cannot be edited.");
        }
        if (Boolean.TRUE.equals(message.getReported())) {
            throw new ContentUnderReviewException();
        }

        message.setContent(contentSanitizer.mask(newContent));
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        message = messageRepository.save(message);

        MessageDto updatedMessageDto = new MessageDto(message);
        updatedMessageDto.setEdited(true);
        List<String> destinations = getDestination(conversationType, updatedMessageDto);

        // ✅ Defer broadcasting
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, updatedMessageDto);
                }
            }
        });

        return updatedMessageDto;
    }


    public MessageDto deleteMessage(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        MessageDto deletedMessageDto = new MessageDto(message); // ✅ Capture details before deletion
        messageRepository.delete(message); // ✅ Permanently delete message

        return deletedMessageDto;
    }

    @Transactional
    public MessageDto deleteMessageAndBroadcast(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        MessageDto deletedMessageDto = new MessageDto(message);
        deletedMessageDto.setDeleted(true);

        boolean hasManagedMedia = "image".equalsIgnoreCase(message.getType())
                || "voice".equalsIgnoreCase(message.getType());
        String mediaContent = message.getContent();
        int metadataSeparator = mediaContent == null ? -1 : mediaContent.indexOf('|');
        String mediaUrl = metadataSeparator >= 0
                ? mediaContent.substring(0, metadataSeparator)
                : mediaContent;

        messageRepository.delete(message);
        List<String> destinations = getDestination(message.getConversationType(), deletedMessageDto);

        // Broadcast only after the database delete commits.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, deletedMessageDto);
                }
            }
        });
        if (hasManagedMedia && mediaUrl != null && !mediaUrl.isBlank()) {
            ossCleanupService.deleteAfterCommit(mediaUrl);
        }

        return deletedMessageDto;
    }



    public Message getMessageById(Long messageId) {
        return messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
    }
}
