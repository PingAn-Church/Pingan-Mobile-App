//package com.fyp.backend.dto;
//
//import com.fyp.backend.model.GroupConversation;
//import com.fyp.backend.model.PrivateConversation;
//import com.fyp.backend.model.User;
//import lombok.Data;
//import lombok.NoArgsConstructor;
//import java.util.ArrayList;
//import java.util.List;
//import java.util.stream.Collectors;
//
//@Data
//@NoArgsConstructor
//public class ConversationDto {
//
//    private Long conversationId;
//    private String conversationType; // "group" or "private"
//    private String groupName;
//    private String groupIcon;
//    private List<Long> participants;
//    private List<String> participantNames;
//    private List<Long> adminIds;
//    private List<String> adminNames;
//
//    // Constructor for GroupConversation
//    public ConversationDto(GroupConversation groupConversation) {
//        this.conversationId = groupConversation.getId();
//        this.conversationType = "group";
//        this.groupName = groupConversation.getGroupName();
//        this.groupIcon = groupConversation.getGroupIcon();
//        this.participants = groupConversation.getParticipants().stream()
//                .map(User::getId)
//                .collect(Collectors.toList());
//        this.participantNames = groupConversation.getParticipants().stream()
//                .map(user -> user.getFirstName() + " " + user.getLastName())
//                .collect(Collectors.toList());
//        this.adminIds = (groupConversation.getAdmins() != null)
//                ? groupConversation.getAdmins().stream().map(User::getId).collect(Collectors.toList())
//                : new ArrayList<>();
//        this.adminNames = (groupConversation.getAdmins() != null)
//                ? groupConversation.getAdmins().stream().map(user -> user.getFirstName() + " " + user.getLastName()).collect(Collectors.toList())
//                : new ArrayList<>();
//    }
//
//    // Constructor for PrivateConversation
//    public ConversationDto(PrivateConversation privateConversation) {
//        this.conversationId = privateConversation.getId(); // ✅ Works now because PrivateConversation extends Conversation
//        this.conversationType = "private";
//        this.groupName = null;
//        this.groupIcon = null;
//        this.participants = privateConversation.getParticipants().stream()
//                .map(User::getId)
//                .collect(Collectors.toList());
//        this.participantNames = privateConversation.getParticipants().stream()
//                .map(user -> user.getFirstName() + " " + user.getLastName())
//                .collect(Collectors.toList());
//        this.adminIds = new ArrayList<>();
//        this.adminNames = new ArrayList<>();
//    }
//}


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
    private List<Long> adminIds = new ArrayList<>();
    private List<String> adminNames = new ArrayList<>();
    private Long createdAt;
    private Long updatedAt;

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
                .map(user -> user.getFirstName() + " " + user.getLastName())
                .collect(Collectors.toList());
        this.adminIds = (groupConversation.getAdmins() != null)
                ? groupConversation.getAdmins().stream().map(User::getId).collect(Collectors.toList())
                : new ArrayList<>();
        this.adminNames = (groupConversation.getAdmins() != null)
                ? groupConversation.getAdmins().stream().map(user -> user.getFirstName() + " " + user.getLastName()).collect(Collectors.toList())
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
                .map(user -> user.getFirstName() + " " + user.getLastName())
                .collect(Collectors.toList());
        this.adminIds = new ArrayList<>();
        this.adminNames = new ArrayList<>();
    }
}
