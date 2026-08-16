package com.fyp.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.ColumnDefault;
import java.util.List;

@Entity
@Data
@NoArgsConstructor
@Table(name = "group_conversations")
public class GroupConversation extends Conversation {

    @Column(nullable = false)
    private String groupName;

    // Chinese name, shown to readers whose app language is Chinese. Null on
    // ordinary groups — their creator picked one name and everyone sees it.
    // Only the app-level group is named in both languages.
    @Column
    private String groupNameZh;

    // Marks the single app-level group that every verified member belongs to.
    // Exactly one row ever carries this; see AppGroupChatService.
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean appLevel = false;

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
