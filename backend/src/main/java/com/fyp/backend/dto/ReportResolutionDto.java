package com.fyp.backend.dto;

import java.util.List;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ReportResolutionDto {
    private ReportDto report;
    private List<Long> affectedReportIds;
    private Long deactivatedUserId;
}
