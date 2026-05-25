package com.fyp.backend.repository;

import com.fyp.backend.model.MessageDeliveryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageDeliveryStatusRepository extends JpaRepository<MessageDeliveryStatus, Long> {
    List<MessageDeliveryStatus> findByMessageId(Long messageId);
    void deleteByMessageIdAndUserId(Long messageId, Long userId);

}
