package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fyp.backend.model.MessageReport;

public interface MessageReportRepository extends JpaRepository<MessageReport, Long> {
    boolean existsByMessageId(Long messageId);

    @Query(
            value = """
                    SELECT r FROM MessageReport r
                    WHERE (:status IS NULL OR r.status = :status)
                      AND (:fromTime IS NULL OR r.reportedAt >= :fromTime)
                      AND (:toTime IS NULL OR r.reportedAt <= :toTime)
                    ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END,
                             r.reportedAt DESC,
                             r.id DESC
                    """,
            countQuery = """
                    SELECT COUNT(r) FROM MessageReport r
                    WHERE (:status IS NULL OR r.status = :status)
                      AND (:fromTime IS NULL OR r.reportedAt >= :fromTime)
                      AND (:toTime IS NULL OR r.reportedAt <= :toTime)
                    """)
    Page<MessageReport> findReports(
            @Param("status") String status,
            @Param("fromTime") java.sql.Timestamp from,
            @Param("toTime") java.sql.Timestamp to,
            Pageable pageable);

    List<MessageReport> findBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);

    long countBySenderIdOrReporterIdOrResolvedById(Long senderId, Long reporterId, Long resolvedById);
}
