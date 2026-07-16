package com.fyp.backend.repository;

import com.fyp.backend.model.PrivateConversation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface PrivateConversationRepository extends JpaRepository<PrivateConversation, Long> {

    // ✅ Corrected query: Find private conversations where the user is one of the two participants
    @Query("SELECT p FROM PrivateConversation p WHERE p.userOne.id = :userId OR p.userTwo.id = :userId")
    List<PrivateConversation> findByUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(p) FROM PrivateConversation p WHERE p.userOne.id = :userId OR p.userTwo.id = :userId")
    long countByUserId(@Param("userId") Long userId);

    // Single-query membership check — safe to call from WebSocket threads.
    @Query("SELECT COUNT(p) > 0 FROM PrivateConversation p WHERE p.id = :conversationId AND (p.userOne.id = :userId OR p.userTwo.id = :userId)")
    boolean isParticipant(@Param("conversationId") Long conversationId, @Param("userId") Long userId);

    @EntityGraph(attributePaths = {"userOne", "userTwo"})
    @Query("SELECT p FROM PrivateConversation p WHERE p.id = :conversationId")
    Optional<PrivateConversation> findWithParticipantsById(@Param("conversationId") Long conversationId);
}
