package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.MessageReport;

public interface MessageReportRepository extends JpaRepository<MessageReport, Long> {
    boolean existsByMessageId(Long messageId);

    List<MessageReport> findAllByOrderByReportedAtDesc();
}
