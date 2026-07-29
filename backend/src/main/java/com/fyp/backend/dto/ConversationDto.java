
package com.fyp.backend.dto;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
public class ConversationDto {

    private Long conversationId;
    private String conversationType; // "group" or "private"
    private String groupName;
    private String groupIcon;
    private List<Long> participants = new ArrayList<>();  // Ensure initialization
    private List<String> participantNames = new ArrayList<>();
    // Minimal per-participant info (id, name, avatar — no email) so chat clients
    // can render conversations without fetching the global user directory.
    private List<UserSummaryDto> participantProfiles = new ArrayList<>();
    private List<Long> adminIds = new ArrayList<>();
    private List<String> adminNames = new ArrayList<>();
    private Long createdAt;
    private Long updatedAt;
    // Server-computed unread badge so clients don't need every message to count.
    private long unreadCount = 0;
    // Whether the logged-in user muted this conversation. Ships with the list so the
    // app can total up unread across conversations without a mute call per row.
    private boolean muted = false;

    // Constructor for GroupConversation
    public ConversationDto(GroupConversation groupConversation) {
        this.conversationId = groupConversation.getId();
        this.conversationType = "group";
        this.groupName = groupConversation.getGroupName();
        this.groupIcon = groupConversation.getGroupIcon();
        this.createdAt = groupConversation.getCreatedAt() != null
                ? groupConversation.getCreatedAt().getTime()
                : null;
        this.updatedAt = groupConversation.getUpdatedAt() != null
                ? groupConversation.getUpdatedAt().getTime()
                : null;
        this.participants = groupConversation.getParticipants().stream()
                .map(User::getId)
                .collect(Collectors.toList());
        this.participantNames = groupConversation.getParticipants().stream()
                .map(ConversationDto::displayName)
                .collect(Collectors.toList());
        this.participantProfiles = groupConversation.getParticipants().stream()
                .map(UserSummaryDto::from)
                .collect(Collectors.toList());
        this.adminIds = (groupConversation.getAdmins() != null)
                ? groupConversation.getAdmins().stream().map(User::getId).collect(Collectors.toList())
                : new ArrayList<>();
        this.adminNames = (groupConversation.getAdmins() != null)
                ? groupConversation.getAdmins().stream().map(ConversationDto::displayName).collect(Collectors.toList())
                : new ArrayList<>();
    }

    // Constructor for PrivateConversation
    public ConversationDto(PrivateConversation privateConversation) {
        this.conversationId = privateConversation.getId();
        this.conversationType = "private";
        this.groupName = null;
        this.groupIcon = null;
        this.createdAt = privateConversation.getCreatedAt() != null
                ? privateConversation.getCreatedAt().getTime()
                : null;
        this.updatedAt = privateConversation.getUpdatedAt() != null
                ? privateConversation.getUpdatedAt().getTime()
                : null;
        this.participants = privateConversation.getParticipants().stream()
                .map(User::getId)
                .collect(Collectors.toList());
        this.participantNames = privateConversation.getParticipants().stream()
                .map(ConversationDto::displayName)
                .collect(Collectors.toList());
        this.participantProfiles = privateConversation.getParticipants().stream()
                .map(UserSummaryDto::from)
                .collect(Collectors.toList());
        this.adminIds = new ArrayList<>();
        this.adminNames = new ArrayList<>();
    }

    private static String displayName(User user) {
        if (user == null) {
            return "Unknown User";
        }
        if (user.isDeletedAccount()) {
            return "Deleted Account";
        }
        String name = ((user.getFirstName() == null ? "" : user.getFirstName()) + " "
                + (user.getLastName() == null ? "" : user.getLastName())).trim();
        return name.isEmpty() ? "Unknown User" : name;
    }
}
