package com.fyp.backend.controller;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.UserSummaryDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageKind;
import com.fyp.backend.service.AppGroupChatService;
import com.fyp.backend.service.ChatService;
import com.fyp.backend.service.ConversationMuteService;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.MessageReactionService;
import com.fyp.backend.service.PollService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.Pagination;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/chat")
@PreAuthorize("hasRole('VERIFIED')")
public class ChatController {

    private final ConversationService conversationService;
    private final ChatService chatService;
    private final UserService userService;
    private final JwtUtil jwtUtil;
    private final ConversationMuteService conversationMuteService;
    private final AppGroupChatService appGroupChatService;
    private final MessageReactionService messageReactionService;
    private final PollService pollService;

    @Autowired
    public ChatController(ConversationService conversationService, ChatService chatService, JwtUtil jwtUtil,
                          UserService userService, ConversationMuteService conversationMuteService,
                          AppGroupChatService appGroupChatService,
                          MessageReactionService messageReactionService,
                          PollService pollService) {
        this.conversationService = conversationService;
        this.chatService = chatService;
        this.userService = userService;
        this.jwtUtil = jwtUtil;
        this.conversationMuteService = conversationMuteService;
        this.appGroupChatService = appGroupChatService;
        this.messageReactionService = messageReactionService;
        this.pollService = pollService;
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

    /**
     * Renames the app-level group. Both languages at once: it is the only chat
     * whose name is written twice, and letting one half be saved without the
     * other would leave part of the church looking at a blank title.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/app-group/name")
    public ResponseEntity<?> renameAppGroup(@RequestBody Map<String, String> body) {
        try {
            GroupConversation renamed = appGroupChatService.rename(
                    body == null ? null : body.get("name"),
                    body == null ? null : body.get("nameZh"));
            return ResponseEntity.ok(conversationService.getConversationById(renamed.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Turns the in-app assistant on or off for a group.
     *
     * Group admins only, and the service moves the assistant on and off the roster
     * with the flag — a flag on its own would leave an assistant whose mentions are
     * stripped before they are stored, which fails completely silently.
     */
    @PutMapping("/conversation/{conversationId}/assistant")
    public ResponseEntity<?> setAssistantEnabled(@PathVariable Long conversationId,
                                                 @RequestBody Map<String, Boolean> body,
                                                 HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        boolean enabled = body != null && Boolean.TRUE.equals(body.get("enabled"));
        try {
            return ResponseEntity.ok(
                    conversationService.setAssistantEnabled(conversationId, enabled, userId));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(403).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * A page of a group's members, for the group details screen. Only conversations
     * you are in, and only the non-PII summary shape.
     */
    @GetMapping("/conversation/{conversationId}/participants")
    public ResponseEntity<Map<String, Object>> listGroupParticipants(
            @PathVariable Long conversationId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null || !conversationService.isUserPartOfConversation(conversationId, loggedInUserId)) {
            return ResponseEntity.status(403).body(Map.of("success", false));
        }
        Pageable pageable = PageRequest.of(
                Pagination.clampPage(page),
                Pagination.clampSize(size),
                Sort.by("firstName").ascending().and(Sort.by("id").ascending()));
        Page<UserSummaryDto> members = conversationService.getGroupParticipants(conversationId, pageable);
        return ResponseEntity.ok(Pagination.envelope(members.getContent(), members));
    }

    // Fetch a specific conversation
    @GetMapping("/conversation/{conversationId}")
    public ResponseEntity<ConversationDto> getConversationById(@PathVariable Long conversationId, HttpServletRequest request) {
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (loggedInUserId == null || !conversationService.isUserPartOfConversation(conversationId, loggedInUserId)) {
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
                                            @RequestParam(required = false) Long before,
                                            @RequestParam(defaultValue = "30") int size,
                                            HttpServletRequest request) {
        // Extract userId from JWT Token
        Long loggedInUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));

        if (loggedInUserId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }

        try {
            // Cursor-paginated page (newest window first; older pages via `before`).
            return ResponseEntity.ok(
                    chatService.getChatHistoryPage(conversationId, conversationType, loggedInUserId, before, size));
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

        // Only words need a body; media carries a URL and a share carries an id.
        MessageKind kind = MessageKind.of(messageDto.getType());
        if (kind.requiresContent() &&
                (messageDto.getContent() == null || messageDto.getContent().trim().isEmpty())) {
            return ResponseEntity.badRequest().body("Message content cannot be empty.");
        }
        // A group notice is posted by the pin action, never typed.
        if (!kind.clientMaySend()) {
            return ResponseEntity.badRequest().body("This kind of message cannot be sent directly.");
        }

        try {
            // Ensure user is a participant in the conversation
            if (!conversationService.isUserPartOfConversation(messageDto.getConversationId(), loggedInUserId)) {
                return ResponseEntity.status(403).body("You are not part of this conversation.");
            }

            // Identity is server-owned. Never trust a sender id supplied by the client.
            messageDto.setSenderId(loggedInUserId);
            messageDto.setConversationType(conversationType);
            MessageDto sentMessage = chatService.sendMessageAndBroadcast(messageDto, conversationType);
            return ResponseEntity.ok(sentMessage);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * Marks a whole conversation read for the logged-in user, called when they open
     * it. The per-message WebSocket receipts only cover the loaded history page, so
     * without this the unread badge reappears on the next refetch.
     */
    @PostMapping("/read")
    public ResponseEntity<?> markConversationRead(@RequestParam Long conversationId,
                                                  @RequestParam String conversationType,
                                                  HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            long remaining = chatService.markConversationRead(userId, conversationId, conversationType);
            return ResponseEntity.ok(Map.of("unreadCount", remaining));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    // Per-conversation push-notification mute for the logged-in user.
    @GetMapping("/mute")
    public ResponseEntity<?> getMuteStatus(@RequestParam Long conversationId,
                                           @RequestParam String conversationType,
                                           HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        return ResponseEntity.ok(Map.of(
                "muted", conversationMuteService.isMuted(userId, conversationId, conversationType)));
    }

    @PutMapping("/mute")
    public ResponseEntity<?> setMuteStatus(@RequestParam Long conversationId,
                                           @RequestParam String conversationType,
                                           @RequestParam boolean muted,
                                           HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            conversationMuteService.setMuted(userId, conversationId, conversationType, muted);
            return ResponseEntity.ok(Map.of("muted", muted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /**
     * Adds (on=true) or withdraws the caller's emoji on a message. Answers the
     * message as the caller now sees it, tallies included; everyone else in the
     * conversation gets the same message re-broadcast over the socket.
     */
    @PutMapping("/reactions")
    public ResponseEntity<?> toggleReaction(@RequestParam Long messageId,
                                            @RequestParam String emoji,
                                            @RequestParam boolean on,
                                            HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(messageReactionService.toggle(messageId, userId, emoji, on));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Who reacted to a message with one emoji; participants of the conversation only. */
    @GetMapping("/reactions/users")
    public ResponseEntity<?> reactionUsers(@RequestParam Long messageId,
                                           @RequestParam String emoji,
                                           HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(messageReactionService.reactors(messageId, emoji, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    // --- Polls and sign-up sheets -------------------------------------------------

    /** Creates a poll and posts the message carrying it; answers that message. */
    @PostMapping("/polls")
    public ResponseEntity<?> createPoll(@RequestParam String conversationType,
                                        @RequestBody CreatePollRequest body,
                                        HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(chatService.createPoll(conversationType, userId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Sets the caller's choices to exactly {@code optionIds} (empty to withdraw). Answers the poll's message. */
    @PutMapping("/polls/{pollId}/votes")
    public ResponseEntity<?> vote(@PathVariable Long pollId,
                                  @RequestBody Map<String, List<Long>> body,
                                  HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            List<Long> optionIds = body == null ? List.of() : body.getOrDefault("optionIds", List.of());
            return ResponseEntity.ok(pollService.vote(pollId, userId, optionIds));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Adds the caller to a sign-up sheet; body may carry {@code text} and {@code note}. */
    @PostMapping("/polls/{pollId}/entries")
    public ResponseEntity<?> addEntry(@PathVariable Long pollId,
                                      @RequestBody(required = false) Map<String, String> body,
                                      HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            String text = body == null ? null : body.get("text");
            String note = body == null ? null : body.get("note");
            return ResponseEntity.ok(pollService.addEntry(pollId, userId, text, note));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Takes the caller off a sign-up sheet. */
    @DeleteMapping("/polls/{pollId}/entries")
    public ResponseEntity<?> removeEntry(@PathVariable Long pollId, HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(pollService.removeEntry(pollId, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Ends the poll early; the creator or a group admin. */
    @PostMapping("/polls/{pollId}/close")
    public ResponseEntity<?> closePoll(@PathVariable Long pollId, HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(pollService.close(pollId, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** Who chose an option; not on anonymous polls. */
    @GetMapping("/polls/{pollId}/options/{optionId}/voters")
    public ResponseEntity<?> pollVoters(@PathVariable Long pollId,
                                        @PathVariable Long optionId,
                                        HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(pollService.voters(pollId, optionId, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    // --- Group notice (one pinned message per group; admins only) -----------------

    /** Pins a message as the group notice; answers the conversation with its notice attached. */
    @PutMapping("/groups/{conversationId}/notice")
    public ResponseEntity<?> pinGroupNotice(@PathVariable Long conversationId,
                                            @RequestParam Long messageId,
                                            HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(conversationService.pinMessage(conversationId, messageId, userId));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/groups/{conversationId}/notice")
    public ResponseEntity<?> unpinGroupNotice(@PathVariable Long conversationId, HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(conversationService.unpinMessage(conversationId, userId));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** {@code {read, total}}: how many members have read up to the notice. Admins only. */
    @GetMapping("/groups/{conversationId}/notice/readers")
    public ResponseEntity<?> groupNoticeReaders(@PathVariable Long conversationId, HttpServletRequest request) {
        Long userId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (userId == null) {
            return ResponseEntity.status(403).body("Unauthorized access");
        }
        try {
            return ResponseEntity.ok(conversationService.noticeReaders(conversationId, userId));
        } catch (AccessDeniedException e) {
            return ResponseEntity.status(403).body(e.getMessage());
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
