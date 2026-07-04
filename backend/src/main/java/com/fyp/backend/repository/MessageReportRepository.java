package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.fyp.backend.model.MessageReport;

public interface MessageReportRepository extends JpaRepository<MessageReport, Long>, JpaSpecificationExecutor<MessageReport> {
    boolean existsByMessageId(Long messageId);

    List<MessageReport> findBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);

    long countBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);
}
