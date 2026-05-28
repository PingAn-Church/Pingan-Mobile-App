package com.fyp.backend.service;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.*;
import com.fyp.backend.mq.MessagePublisher;
import com.fyp.backend.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.MalformedURLException;
import java.net.URL;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private final MessageRepository messageRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;
    private final UserRepository userRepository;
    private final MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OSSService ossService;
    private final RedisService redisService;
    private final MessagePublisher messagePublisher;
    private final PushNotificationService pushNotificationService;

    @Autowired
    public ChatService(MessageRepository messageRepository,
                       GroupConversationRepository groupConversationRepository,
                       PrivateConversationRepository privateConversationRepository,
                       UserRepository userRepository,
                       MessageDeliveryStatusRepository messageDeliveryStatusRepository, SimpMessagingTemplate messagingTemplate,
                       OSSService ossService,
                       RedisService redisService,
                       MessagePublisher messagePublisher,
                       PushNotificationService pushNotificationService) {
        this.messageRepository = messageRepository;
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
        this.userRepository = userRepository;
        this.messageDeliveryStatusRepository = messageDeliveryStatusRepository;
        this.messagingTemplate = messagingTemplate;
        this.ossService = ossService;
        this.redisService = redisService;
        this.messagePublisher = messagePublisher;
        this.pushNotificationService = pushNotificationService;
    }

//    private Conversation getConversationByTypeAndId(Long conversationId, String conversationType) {
//        if ("group".equals(conversationType)) {
//            return groupConversationRepository.findById(conversationId)
//                    .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
//        } else if ("private".equals(conversationType)) {
//            return privateConversationRepository.findById(conversationId)
//                    .orElseThrow(() -> new IllegalArgumentException("Private conversation not found"));
//        } else {
//            throw new IllegalArgumentException("Invalid conversation type");
//        }
//    }

    private Conversation getConversationByTypeAndId(Long conversationId, String conversationType) {
        System.out.println("🔍 [GetConversation] Looking up conversationId = " + conversationId + ", type = " + conversationType);

        if ("group".equals(conversationType)) {
            return groupConversationRepository.findById(conversationId)
                    .map(gc -> {
                        System.out.println("✅ [GetConversation] Found group conversation");
                        return gc;
                    })
                    .orElseThrow(() -> {
                        System.out.println("❌ [GetConversation] Group conversation not found");
                        return new IllegalArgumentException("Group conversation not found");
                    });
        } else if ("private".equals(conversationType)) {
            return privateConversationRepository.findById(conversationId)
                    .map(pc -> {
                        System.out.println("✅ [GetConversation] Found private conversation");
                        return pc;
                    })
                    .orElseThrow(() -> {
                        System.out.println("❌ [GetConversation] Private conversation not found");
                        return new IllegalArgumentException("Private conversation not found");
                    });
        } else {
            System.out.println("❌ [GetConversation] Invalid conversation type: " + conversationType);
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
        List<Long> recipientIds = conversation.getParticipants().stream()
                .map(User::getId)
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

//    public List<MessageDto> getChatHistory(Long conversationId, String conversationType, Long userId) {
//        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);
//        checkUserIsParticipant(conversation, userId);
//
//        List<Message> messages = messageRepository.findByConversationId(conversationId);
//        return messages.stream()
//                .map(MessageDto::new)
//                .collect(Collectors.toList());
//    }

    public List<MessageDto> getChatHistory(Long conversationId, String conversationType, Long userId) {
        System.out.println("📩 [ChatHistory] Request received for conversationId = " + conversationId + ", type = " + conversationType + ", userId = " + userId);

        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);

        System.out.println("👥 [ChatHistory] Participants in conversation: " +
                conversation.getParticipants().stream().map(User::getId).toList());

        try {
            checkUserIsParticipant(conversation, userId);
            System.out.println("✅ [ChatHistory] User is a participant.");
        } catch (Exception e) {
            System.out.println("❌ [ChatHistory] User " + userId + " is NOT a participant — throwing 403");
            throw e;
        }

        List<Message> messages = messageRepository.findByConversationId(conversationId);
        return messages.stream()
                .map(MessageDto::new)
                .collect(Collectors.toList());
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

    private String getPushNotificationTitle(String conversationType, User sender, Long conversationId) {
        if ("private".equals(conversationType)) {
            // For private messages, use the sender's full name
            return sender.getFirstName() + " " + sender.getLastName();  // Title with sender's name
        } else if ("group".equals(conversationType)) {
            // For group messages, use the group name
            GroupConversation group = groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new RuntimeException("Group conversation not found"));
            return group.getGroupName();  // Title with group name
        }
        return "New message";  // Default title if neither group nor private
    }

    private String getPushNotificationBody(MessageDto messageDto) {
        if (messageDto == null) {
            return "New message";
        }

        String messageType = messageDto.getType() == null ? "" : messageDto.getType().trim().toLowerCase();
        return switch (messageType) {
            case "voice" -> "🎤 Voice message";
            case "image" -> "🖼️ Photo";
            default -> {
                String content = messageDto.getContent();
                yield (content == null || content.trim().isEmpty()) ? "New message" : content;
            }
        };
    }

//    @Transactional
//    public MessageDto sendMessageAndBroadcast(MessageDto messageDto, String conversationType) {
//        Conversation conversation = getConversationByTypeAndId(messageDto.getConversationId(), conversationType);
//        User sender = getUserById(messageDto.getSenderId());
//        checkUserIsParticipant(conversation, sender.getId());
//
//        Timestamp timestamp = new Timestamp(System.currentTimeMillis());
//        Message message = new Message(messageDto, conversation, sender, timestamp.toString());
//        message = messageRepository.save(message);
//
//        createDeliveryStatuses(conversation, sender, message, timestamp);
//
//        MessageDto savedMessage = buildResponseDto(message, conversation);
//
////        List<String> destinations = getDestination(conversationType, savedMessage);
////
////        for (String destination : destinations) {
////            messagingTemplate.convertAndSend(destination, savedMessage);
////            System.out.println("✅ Message sent to destination: {}" + destination);
////        }
//
//        for (Long recipientId : savedMessage.getRecipientIds()) {
//            String email = userRepository.findById(recipientId).map(User::getEmail).orElse(null);
//            if (email != null) {
//                if (redisService.isUserOnline(email)) {
//                    messagingTemplate.convertAndSend("/user/" + recipientId + "/queue/messages", savedMessage);
//                } else {
//                    messagePublisher.queueMessage(email, savedMessage); // 👈 Queue by email
//                }
//            }
//        }
//
//        // Always send to sender
//        messagingTemplate.convertAndSend("/user/" + savedMessage.getSenderId() + "/queue/messages", savedMessage);
//
//        // Send push notifications to recipients (directly passing recipientIds from MessageDto)
////        pushNotificationService.sendPushNotification(savedMessage.getRecipientIds(), messageDto.getContent());
//
//        // Send push notifications to recipients with proper title (from ChatService)
//        String notificationTitle = getPushNotificationTitle(conversationType, sender, savedMessage.getConversationId());
////        pushNotificationService.sendPushNotification(savedMessage.getRecipientIds(), messageDto.getContent(), notificationTitle);
//        pushNotificationService.sendPushNotification(savedMessage.getRecipientIds(), messageDto.getContent(), notificationTitle, savedMessage.getConversationId(), conversationType);
//
//        return savedMessage;
//    }

    @Transactional
    public MessageDto sendMessageAndBroadcast(MessageDto messageDto, String conversationType) {
        Conversation conversation = getConversationByTypeAndId(messageDto.getConversationId(), conversationType);
        User sender = getUserById(messageDto.getSenderId());
        checkUserIsParticipant(conversation, sender.getId());

        Timestamp timestamp = new Timestamp(System.currentTimeMillis());
        Message message = new Message(messageDto, conversation, sender, timestamp.toString());
        message = messageRepository.save(message);

        createDeliveryStatuses(conversation, sender, message, timestamp);

        MessageDto savedMessage = buildResponseDto(message, conversation);
        String notificationTitle = getPushNotificationTitle(conversationType, sender, savedMessage.getConversationId());
        String notificationBody = getPushNotificationBody(savedMessage);

        // ✅ Defer messaging and notifications
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (Long recipientId : savedMessage.getRecipientIds()) {
                    String email = userRepository.findById(recipientId).map(User::getEmail).orElse(null);
                    if (email != null) {
                        if (redisService.isUserOnlineAnywhere(email)) {
                            messagingTemplate.convertAndSend("/user/" + recipientId + "/queue/messages", savedMessage);
                        } else {
                            messagePublisher.queueMessage(email, savedMessage);
                        }
                    }
                }

                // Always notify sender
                messagingTemplate.convertAndSend("/user/" + savedMessage.getSenderId() + "/queue/messages", savedMessage);

                // Push Notification
                pushNotificationService.sendPushNotification(
                        savedMessage.getRecipientIds(),
                        notificationBody,
                        notificationTitle,
                        savedMessage.getConversationId(),
                        conversationType
                );
            }
        });

        return savedMessage;
    }

    public void updateMessageStatus(Long messageId, Long userId, String status) {
        MessageDeliveryStatus deliveryStatus = getDeliveryStatus(messageId, userId);
        if (deliveryStatus != null) {
            deliveryStatus.setStatus(status);
            deliveryStatus.setTimestamp(new Timestamp(System.currentTimeMillis()));
            messageDeliveryStatusRepository.save(deliveryStatus);
        }
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

//    @Transactional
//    public MessageDto editMessageAndBroadcast(Long messageId, String newContent, String conversationType, Long loggedInUserId) {
//        // Get conversation and message
//        Message message = messageRepository.findById(messageId)
//                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
//
//        // Ensure only the sender can edit
//        if (!message.getSender().getId().equals(loggedInUserId)) {
//            throw new IllegalArgumentException("You can only edit your own messages.");
//        }
//
//        // ✅ Prevent editing image messages
//        if ("image".equalsIgnoreCase(message.getType())) {
//            throw new IllegalArgumentException("Image messages cannot be edited.");
//        }
//
//        // Update the content of the message
//        message.setContent(newContent);
//        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
//
//        // Save the updated message in the database
//        message = messageRepository.save(message);
//
//        // Build the MessageDto to return
//        MessageDto updatedMessageDto = new MessageDto(message);
//        updatedMessageDto.setEdited(true);
//        List<String> destinations = getDestination(conversationType, updatedMessageDto);
//
//        // Broadcast the updated message to the relevant destinations
//        for (String destination : destinations) {
//            messagingTemplate.convertAndSend(destination, updatedMessageDto);
//        }
//
//        // Return the updated message DTO
//        return updatedMessageDto;
//    }

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

        message.setContent(newContent);
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

    private String extractObjectKeyFromUrl(String url) {
        try {
            URL parsedUrl = new URL(url);
            return parsedUrl.getPath().substring(1); // remove leading '/'
        } catch (MalformedURLException e) {
            throw new RuntimeException("Invalid OSS URL format");
        }
    }

//    @Transactional
//    public MessageDto deleteMessageAndBroadcast(Long messageId) {
//        Message message = messageRepository.findById(messageId)
//                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
//
//        // Prepare MessageDto for broadcasting
//        MessageDto deletedMessageDto = new MessageDto(message);
//        deletedMessageDto.setDeleted(true);
//
//        // ✅ If it's an image, also delete from OSS
//        if ("image".equalsIgnoreCase(message.getType())) {
//            String imageUrl = message.getContent();
//            String objectKey = extractObjectKeyFromUrl(imageUrl);
//            ossService.deleteObject(objectKey);
//        }
//
//        // Delete message from DB
//        messageRepository.delete(message);
//
//        // Broadcast the deletion to all connected clients
//        List<String> destinations = getDestination(message.getConversationType(), deletedMessageDto);
//        System.out.println("DESTINATIONS" + destinations + deletedMessageDto);
//        for (String destination : destinations) {
//            System.out.println("SENDING TO" + destination);
//            messagingTemplate.convertAndSend(destination, deletedMessageDto);
//        }
//
//        // Return the deleted message details
//        return deletedMessageDto;
//    }

    @Transactional
    public MessageDto deleteMessageAndBroadcast(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        MessageDto deletedMessageDto = new MessageDto(message);
        deletedMessageDto.setDeleted(true);

        // If image, delete from OSS
        if ("image".equalsIgnoreCase(message.getType())) {
            String imageUrl = message.getContent();
            String objectKey = extractObjectKeyFromUrl(imageUrl);
            ossService.deleteObject(objectKey);
        }

        messageRepository.delete(message);
        List<String> destinations = getDestination(message.getConversationType(), deletedMessageDto);

        // ✅ Defer broadcasting
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, deletedMessageDto);
                }
            }
        });

        return deletedMessageDto;
    }



    public Message getMessageById(Long messageId) {
        return messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
    }
}
