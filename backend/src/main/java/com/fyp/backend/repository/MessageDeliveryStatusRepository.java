package com.fyp.backend.repository;

import com.fyp.backend.model.MessageDeliveryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageDeliveryStatusRepository extends JpaRepository<MessageDeliveryStatus, Long> {
    List<MessageDeliveryStatus> findByMessageId(Long messageId);
    void deleteByMessageIdAndUserId(Long messageId, Long userId);

    long countByUserId(Long userId);

    // Account-deletion sweep: drop this user's delivery rows across every message
    // (including others' messages they were a recipient of), in one statement.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MessageDeliveryStatus d WHERE d.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);
}
