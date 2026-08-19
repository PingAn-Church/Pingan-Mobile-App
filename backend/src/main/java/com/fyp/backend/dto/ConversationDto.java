
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
    // Chinese name, non-null only on the app-level group. Both names ship and the
    // client picks by its own language, so a language toggle renames the row
    // instantly instead of waiting for the next fetch.
    private String groupNameZh;
    // True for the one group every verified member belongs to.
    private boolean appLevel = false;
    // Members, for conversations whose roster is not shipped (see below).
    private long participantCount = 0;
    private String groupIcon;

    // Whether the in-app assistant answers when mentioned in this group. The client
    // uses it to decide whether to offer the assistant in the @ picker at all.
    private boolean assistantEnabled = false;

    // Who to offer in the @ picker for the assistant, and under which names.
    //
    // Sent on the conversation rather than found through the member search: the
    // app-level group deliberately never ships its roster, and the assistant is
    // excluded from the user directory so it cannot turn up in "start a new chat"
    // or the admin member lists. Both names travel because either may have been
    // typed — see the mention highlighting in ChatPage.
    private Long assistantId;
    private String assistantName;
    private String assistantNameZh;
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
    // True when something unread in here calls this user out by name. Drives the
    // orange [@] on the row: a mention is worth spotting even in a busy or muted
    // conversation, where the plain unread count says nothing about urgency.
    private boolean mentioned = false;

    // Constructor for GroupConversation
    public ConversationDto(GroupConversation groupConversation) {
        this.conversationId = groupConversation.getId();
        this.conversationType = "group";
        this.groupName = groupConversation.getGroupName();
        this.groupNameZh = groupConversation.getGroupNameZh();
        this.appLevel = groupConversation.isAppLevel();
        this.groupIcon = groupConversation.getGroupIcon();
        this.assistantEnabled = groupConversation.isAssistantEnabled();
        this.createdAt = groupConversation.getCreatedAt() != null
                ? groupConversation.getCreatedAt().getTime()
                : null;
        this.updatedAt = groupConversation.getUpdatedAt() != null
                ? groupConversation.getUpdatedAt().getTime()
                : null;
        // The app-level group holds the whole membership, so its roster is left
        // out: shipping several hundred profiles on every chat-list load would
        // make the list slower for everyone, and nothing on that screen reads
        // them. Screens that genuinely need the members fetch them separately,
        // paginated. participantCount is filled in by the caller, which can ask
        // for it without materialising the list.
        if (!this.appLevel) {
            this.participants = groupConversation.getParticipants().stream()
                    .map(User::getId)
                    .collect(Collectors.toList());
            this.participantNames = groupConversation.getParticipants().stream()
                    .map(ConversationDto::displayName)
                    .collect(Collectors.toList());
            this.participantProfiles = groupConversation.getParticipants().stream()
                    .map(UserSummaryDto::from)
                    .collect(Collectors.toList());
            this.participantCount = this.participants.size();
        }
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
        this.participantCount = this.participants.size();
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
