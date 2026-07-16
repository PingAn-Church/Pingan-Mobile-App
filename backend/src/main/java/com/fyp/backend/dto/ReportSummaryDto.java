package com.fyp.backend.dto;

import java.sql.Timestamp;

import com.fyp.backend.model.MessageReport;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ReportSummaryDto {
    private Long id;
    private String contentType;
    private Long contentId;
    private String status;
    private Timestamp reportedAt;

    public static ReportSummaryDto from(MessageReport report) {
        return ReportSummaryDto.builder()
                .id(report.getId())
                .contentType(report.getContentType())
                .contentId(report.getContentId())
                .status(report.getStatus())
                .reportedAt(report.getReportedAt())
                .build();
    }
}
