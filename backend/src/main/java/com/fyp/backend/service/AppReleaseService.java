package com.fyp.backend.service;

import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.config.app.AppUpdateProperties;
import com.fyp.backend.config.app.AppUpdateProperties.Channel;
import com.fyp.backend.dto.AppReleaseDto;

@Service
public class AppReleaseService {

    private final AppUpdateProperties properties;

    public AppReleaseService(AppUpdateProperties properties) {
        this.properties = properties;
    }

    public AppReleaseDto getLatest(String platform, String channel) {
        String normalizedPlatform = normalize(platform, "android");
        if (!"android".equals(normalizedPlatform)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only Android release metadata is supported.");
        }

        String normalizedChannel = normalize(channel, "direct");
        Channel release = switch (normalizedChannel) {
            case "direct" -> properties.getAndroid().getDirect();
            case "play" -> properties.getAndroid().getPlay();
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown Android distribution channel.");
        };

        return new AppReleaseDto(
                "android",
                normalizedChannel,
                release.getLatestVersionName(),
                release.getLatestVersionCode(),
                release.getMinSupportedVersionCode(),
                release.isForceUpdate(),
                release.getDownloadPageUrl(),
                release.getDownloadPageUrlCn(),
                release.getPlayStoreUrl(),
                release.getBrowserPlayStoreUrl(),
                release.getApkSha256(),
                release.getApkSizeBytes(),
                release.getReleaseNotes());
    }

    private String normalize(String value, String fallback) {
        String v = value == null || value.isBlank() ? fallback : value;
        return v.trim().toLowerCase(Locale.ROOT);
    }
}
