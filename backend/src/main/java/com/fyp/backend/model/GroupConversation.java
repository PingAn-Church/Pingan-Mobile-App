package com.fyp.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Entity
@Data
@NoArgsConstructor
@Table(name = "group_conversations")
public class GroupConversation extends Conversation {

    @Column(nullable = false)
    private String groupName;

    @Column(nullable = true)
    private String groupIcon;

    @ManyToMany
    @JoinTable(
            name = "group_conversation_participants",
            joinColumns = @JoinColumn(name = "conversation_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private List<User> participants;

    @ManyToMany
    @JoinTable(
            name = "group_conversation_admins",
            joinColumns = @JoinColumn(name = "conversation_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private List<User> admins;

    // ✅ Override to provide participant list
    @Override
    public List<User> getParticipants() {
        return participants;
    }
}
