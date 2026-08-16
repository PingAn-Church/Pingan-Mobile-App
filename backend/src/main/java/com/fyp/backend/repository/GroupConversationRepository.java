package com.fyp.backend.repository;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /**
     * The app-level group. Deliberately NOT the @EntityGraph findById above: this
     * group holds the entire membership, and most callers only need its id or its
     * name, not several hundred eagerly-fetched User rows.
     */
    Optional<GroupConversation> findFirstByAppLevelTrue();

    /** Size of a group without materialising its roster. */
    @Query("SELECT COUNT(p) FROM GroupConversation g JOIN g.participants p WHERE g.id = :conversationId")
    long countParticipants(@Param("conversationId") Long conversationId);

    /**
     * A page of a group's members. The only way to see who is in the app-level
     * group, whose roster is left out of the conversation payload entirely.
     */
    @Query("SELECT p FROM GroupConversation g JOIN g.participants p WHERE g.id = :conversationId")
    Page<User> findParticipantsPage(@Param("conversationId") Long conversationId, Pageable pageable);

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
