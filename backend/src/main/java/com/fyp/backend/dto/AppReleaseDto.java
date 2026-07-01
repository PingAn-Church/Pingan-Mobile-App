package com.fyp.backend.dto;

import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AppReleaseDto {
    private String platform;
    private String channel;
    private String latestVersionName;
    private int latestVersionCode;
    private int minSupportedVersionCode;
    private boolean forceUpdate;
    private String downloadPageUrl;
    private String downloadPageUrlCn;
    private String playStoreUrl;
    private String browserPlayStoreUrl;
    private String apkSha256;
    private Long apkSizeBytes;
    private Map<String, String> releaseNotes;
}
