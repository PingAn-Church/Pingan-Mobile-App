package com.fyp.backend.repository;

import com.fyp.backend.model.GroupConversation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupConversationRepository extends JpaRepository<GroupConversation, Long> {
    boolean existsByGroupIconContaining(String fragment);
    @EntityGraph(attributePaths = {"participants"})
    Optional<GroupConversation> findById(Long id);

    // ✅ Corrected query: Find group conversations where the user is a participant
    @Query("SELECT g FROM GroupConversation g JOIN g.participants p WHERE p.id = :userId")
    List<GroupConversation> findByParticipantId(@Param("userId") Long userId);

    @Query("SELECT COUNT(g) FROM GroupConversation g JOIN g.participants p WHERE p.id = :userId")
    long countByParticipantId(@Param("userId") Long userId);

    // Groups where the user lingers in the admin list (e.g. removed as participant
    // earlier but never dropped from admins). Used by account deletion to clear the
    // group_conversation_admins FK so the user row can be removed.
    @Query("SELECT g FROM GroupConversation g JOIN g.admins a WHERE a.id = :userId")
    List<GroupConversation> findByAdminId(@Param("userId") Long userId);

    @Query("SELECT COUNT(g) FROM GroupConversation g JOIN g.admins a WHERE a.id = :userId")
    long countByAdminId(@Param("userId") Long userId);

    @Query("SELECT g FROM GroupConversation g WHERE LOWER(g.groupName) LIKE LOWER(CONCAT('%', :query, '%'))")
    List<GroupConversation> searchByGroupName(@Param("query") String query);

    // Single-query membership check — safe to call from WebSocket threads
    // (no lazy collection access outside a transaction).
    @Query("SELECT COUNT(g) > 0 FROM GroupConversation g JOIN g.participants p WHERE g.id = :conversationId AND p.id = :userId")
    boolean isParticipant(@Param("conversationId") Long conversationId, @Param("userId") Long userId);

    // Membership check keyed on the icon's object name rather than a conversation
    // id, for clients that predate the conversationId parameter on the group
    // download-signing endpoint. The icon name carries a server-generated UUID,
    // so it identifies one group as precisely as the id would.
    // fileName must arrive LIKE-escaped (see ConversationService#isUserInGroupWithIcon):
    // '_' is both legal in an object name and a single-character wildcard, so an
    // unescaped name would match icons it does not actually name.
    @Query("SELECT COUNT(g) > 0 FROM GroupConversation g JOIN g.participants p "
            + "WHERE p.id = :userId AND g.groupIcon LIKE CONCAT('%', :fileName, '%') ESCAPE '!'")
    boolean isParticipantOfGroupWithIcon(@Param("userId") Long userId,
                                         @Param("fileName") String fileName);
}
