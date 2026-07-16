package com.fyp.backend.dto;

import java.sql.Timestamp;

import com.fyp.backend.model.MessageReport;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ReportDto {
    private Long id;
    private String contentType;
    private Long contentId;
    private Long conversationId;
    private String conversationType;
    private String messageType;
    private String messageContent;
    private Long senderId;
    private String senderName;
    private Long reporterId;
    private String reporterName;
    private Timestamp reportedAt;
    private String status;
    private String resolution;
    private Long resolvedById;
    private String resolvedByName;
    private Timestamp resolvedAt;

    public static ReportDto from(MessageReport report) {
        return ReportDto.builder()
                .id(report.getId())
                .contentType(report.getContentType())
                .contentId(report.getContentId())
                .conversationId(report.getConversationId())
                .conversationType(report.getConversationType())
                .messageType(report.getMessageType())
                .messageContent(report.getMessageContent())
                .senderId(report.getSenderId())
                .senderName(report.getSenderName())
                .reporterId(report.getReporterId())
                .reporterName(report.getReporterName())
                .reportedAt(report.getReportedAt())
                .status(report.getStatus())
                .resolution(report.getResolution())
                .resolvedById(report.getResolvedById())
                .resolvedByName(report.getResolvedByName())
                .resolvedAt(report.getResolvedAt())
                .build();
    }
}
