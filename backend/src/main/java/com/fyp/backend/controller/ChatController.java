package com.fyp.backend.controller;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.Message;
import com.fyp.backend.service.ChatService;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/chat")
public class ChatController {

    private final ConversationService conversationService;
    private final ChatService chatService;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    @Autowired
    public ChatController(ConversationService conversationService, ChatService chatService, JwtUtil jwtUtil, UserService userService) {
        this.conversationService = conversationService;
        this.chatService = chatService;
        this.userService = userService;
        this.jwtUtil = jwtUtil;
    }

    // Fetch user's conversations
    @GetMapping("/conversations")
    public ResponseEntity<List<ConversationDto>> listConversations(@RequestParam Long userId, HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null || !loggedInUserId.equals(userId)) {
            return ResponseEntity.status(403).body(null); // Forbidden
        }
        List<ConversationDto> conversations = conversationService.getConversationsByUserId(userId);
        return ResponseEntity.ok(conversations);
    }

    // Fetch a specific conversation
    @GetMapping("/conversation/{conversationId}")
    public ResponseEntity<ConversationDto> getConversationById(@PathVariable Long conversationId, HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null || !conversationService.isUserPartOfConversation(conversationId, loggedInUserId)) {
            System.out.println("FORBIDDEN!!");
            return ResponseEntity.status(403).body(null); // Forbidden
        }
        ConversationDto conversationDto = conversationService.getConversationById(conversationId);
        return ResponseEntity.ok(conversationDto);
    }

    @DeleteMapping("/conversation/{conversationId}")
    public ResponseEntity<?> deleteConversation(@PathVariable Long conversationId, HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized");
        }

        try {
            conversationService.deleteConversation(conversationId, userId);
            return ResponseEntity.ok("Conversation deleted successfully.");
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(500).body("An unexpected error occurred while deleting the conversation.");
        }
    }


    // Start a new conversation (group or private)
    @PostMapping("/start")
    public ResponseEntity<ConversationDto> startNewConversation(@RequestBody ConversationDto conversationDto, HttpServletRequest request) {
        Long creatorId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (creatorId == null) {
            return ResponseEntity.status(403).body(null);
        }
        if (conversationDto.getParticipants() == null || conversationDto.getParticipants().isEmpty()) {
            return ResponseEntity.badRequest().body(null);
        }
        if ("group".equals(conversationDto.getConversationType())) {
            return ResponseEntity.ok(conversationService.createGroupConversation(conversationDto, creatorId));
        } else if ("private".equals(conversationDto.getConversationType())) {
            return ResponseEntity.ok(conversationService.createPrivateConversation(conversationDto, creatorId));
        } else {
            return ResponseEntity.badRequest().body(null);
        }
    }

    @GetMapping("/history")
    public ResponseEntity<?> getChatHistory(@RequestParam Long conversationId,
                                            @RequestParam String conversationType,
                                            HttpServletRequest request) {
        // Extract userId from JWT Token
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        System.out.println("LOGGED IN USER" + loggedInUserId);

        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }

        try {
            // Call chat history only if the user is part of the conversation
            List<MessageDto> messages = chatService.getChatHistory(conversationId, conversationType, loggedInUserId);
            return ResponseEntity.ok(messages);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(403).body("You are not part of this conversation.");
        }
    }

    @PostMapping("/send")
    public ResponseEntity<?> sendMessage(@RequestParam String conversationType,
                                         @RequestBody MessageDto messageDto,
                                         HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }

        // Validate input fields
//        if (messageDto.getContent() == null || messageDto.getContent().trim().isEmpty()) {
//            return ResponseEntity.badRequest().body("Message content cannot be empty.");
//        }

        // NEW - allow image messages
        if ((messageDto.getType() == null || messageDto.getType().equals("text")) &&
                (messageDto.getContent() == null || messageDto.getContent().trim().isEmpty())) {
            return ResponseEntity.badRequest().body("Message content cannot be empty.");
        }

        try {
            // Ensure user is a participant in the conversation
            if (!conversationService.isUserPartOfConversation(messageDto.getConversationId(), loggedInUserId)) {
                return ResponseEntity.status(403).body("You are not part of this conversation.");
            }

            // ✅ Send message via ChatService
            MessageDto sentMessage = chatService.sendMessageAndBroadcast(messageDto, conversationType);
            return ResponseEntity.ok(sentMessage);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PostMapping("/addParticipant")
    public ResponseEntity<ConversationDto> addParticipantToGroup(
            @RequestParam Long conversationId,
            @RequestParam Long userId,
            HttpServletRequest request) {

        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(null);
        }

        try {
            // ✅ Step 1: Update the Database
            ConversationDto updatedConversation = conversationService.addParticipantToGroup(conversationId, userId, currentUserId);
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

    @DeleteMapping("/removeParticipant")
    public ResponseEntity<ConversationDto> removeParticipantFromGroup(
            @RequestParam Long conversationId,
            @RequestParam Long userId,
            HttpServletRequest request) {

        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(null);
        }

        try {
            // ✅ Update the database
            ConversationDto updatedConversation = conversationService.removeParticipantFromGroup(conversationId, userId, currentUserId);

            // ✅ Return the updated conversation
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

    @DeleteMapping("/deleteMessage")
    public ResponseEntity<MessageDto> deleteMessage(@RequestParam Long messageId, HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body(null);
        }

        Message message = chatService.getMessageById(messageId);
        if (!message.getSender().getId().equals(loggedInUserId)) {
            return ResponseEntity.status(403).body(null);
        }

        // ✅ Delete message from DB and broadcast the deletion
        MessageDto deletedMessageDto = chatService.deleteMessageAndBroadcast(messageId);
        return ResponseEntity.ok(deletedMessageDto);
    }

    @PutMapping("/editMessage")
    public ResponseEntity<?> editMessage(@RequestParam Long messageId,
                                         @RequestParam String conversationType,
                                         @RequestBody Map<String, String> requestBody,
                                         HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }

        String newContent = requestBody.get("newContent"); // Changed from newContent to content
        if (newContent == null || newContent.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Message content cannot be empty.");
        }

        try {
            // Delegate the responsibility to the service layer
            MessageDto updatedMessage = chatService.editMessageAndBroadcast(messageId, newContent, conversationType, loggedInUserId);

            // Return the updated message
            return ResponseEntity.ok(updatedMessage);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }


    @PostMapping("/addAdmin")
    public ResponseEntity<ConversationDto> addAdminToGroup(@RequestParam Long conversationId,
                                                  @RequestParam Long userId,
                                                  HttpServletRequest request) {
        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(null);
        }

        try {
            ConversationDto updatedConversation = conversationService.addAdminToGroup(conversationId, userId, currentUserId);
//            return ResponseEntity.ok("User added as an admin.");
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

    @DeleteMapping("/removeAdmin")
    public ResponseEntity<ConversationDto> removeAdminFromGroup(@RequestParam Long conversationId,
                                                                @RequestParam Long userId,
                                                                HttpServletRequest request) {
        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(null);
        }

        try {
            ConversationDto updatedConversation = conversationService.removeAdminFromGroup(conversationId, userId, currentUserId);
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }


    @DeleteMapping("/leaveGroup")
    public ResponseEntity<?> leaveGroup(@RequestParam Long conversationId, HttpServletRequest request) {
        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(Map.of("message", "Unauthorized"));
        }

        try {
            ConversationDto updatedConversation = conversationService.leaveGroup(conversationId, currentUserId);
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }


    @PutMapping("/updateGroupIcon")
    public ResponseEntity<ConversationDto> updateGroupIcon(
            @RequestParam Long conversationId,
            @RequestParam String groupIcon,
            HttpServletRequest request) {

        Long currentUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (currentUserId == null) {
            return ResponseEntity.status(403).body(null); // Unauthorized
        }

        try {
            ConversationDto updatedConversation = conversationService.updateGroupIcon(conversationId, groupIcon, currentUserId);
            return ResponseEntity.ok(updatedConversation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(null);
        }
    }

}
