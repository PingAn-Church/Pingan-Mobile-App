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
    @EntityGraph(attributePaths = {"participants"})
    Optional<GroupConversation> findById(Long id);

    // ✅ Corrected query: Find group conversations where the user is a participant
    @Query("SELECT g FROM GroupConversation g JOIN g.participants p WHERE p.id = :userId")
    List<GroupConversation> findByParticipantId(@Param("userId") Long userId);

    @Query("SELECT g FROM GroupConversation g WHERE LOWER(g.groupName) LIKE LOWER(CONCAT('%', :query, '%'))")
    List<GroupConversation> searchByGroupName(@Param("query") String query);
}
