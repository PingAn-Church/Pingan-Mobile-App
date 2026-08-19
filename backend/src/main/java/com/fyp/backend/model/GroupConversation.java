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
    // PostgreSQL enforces this with a partial unique index installed by
    // DatabaseIntegrityMigration; see AppGroupChatService for creation.
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean appLevel = false;

    @Column(nullable = true)
    private String groupIcon;

    /**
     * Whether the in-app assistant answers when mentioned here.
     *
     * Off by default: nobody should discover mid-conversation that an LLM has been
     * reading along, so switching it on is a deliberate act by a group admin and
     * posts a notice in the group.
     *
     * Turning it on must also put the assistant on the participant list — a mention
     * of a non-participant is stripped before the message is stored, so a flag on
     * its own produces an assistant that is silently, unreportably dead.
     * See ConversationService and AssistantAccountService.
     */
    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean assistantEnabled = false;

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
