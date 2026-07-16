package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.fyp.backend.model.MessageReport;

public interface MessageReportRepository extends JpaRepository<MessageReport, Long>, JpaSpecificationExecutor<MessageReport> {
    boolean existsByContentTypeAndContentIdAndContentFingerprintIn(
            String contentType, Long contentId, List<String> contentFingerprints);

    List<MessageReport> findBySenderIdAndStatus(Long senderId, String status);

    List<MessageReport> findByContentTypeAndContentIdInAndStatus(
            String contentType, List<Long> contentIds, String status);

    List<MessageReport> findBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);

    long countBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);
}
