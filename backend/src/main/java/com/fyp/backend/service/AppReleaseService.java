package com.fyp.backend.service;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.config.app.AppUpdateProperties;
import com.fyp.backend.config.app.AppUpdateProperties.Channel;
import com.fyp.backend.dto.AppReleaseDto;

import jakarta.annotation.PostConstruct;

@Service
public class AppReleaseService {

    private static final Logger log = LoggerFactory.getLogger(AppReleaseService.class);

    private final AppUpdateProperties properties;

    public AppReleaseService(AppUpdateProperties properties) {
        this.properties = properties;
    }

    /**
     * A channel's version metadata as clients are allowed to see it: never newer
     * than what the channel can actually install.
     */
    private record Advertised(String versionName, int versionCode, int minSupportedVersionCode, boolean forceUpdate) {
    }

    /**
     * Deploying the backend and shipping a build are days apart — a store review
     * outlives the CI/CD run that publishes the new version metadata. Advertising
     * {@code latest-*} straight away sends users to a listing that still serves the
     * old build, so nothing is announced until {@code published-*} catches up.
     */
    private Advertised advertise(Channel release) {
        int prepared = release.getLatestVersionCode();
        int published = Math.max(release.getPublishedVersionCode(), 0);
        boolean live = published >= prepared;

        int versionCode = live ? prepared : published;
        String versionName = live ? release.getLatestVersionName() : release.getPublishedVersionName();

        // The clamp is the part that matters most. `forced-update` raises
        // min-supported to the new code, and a client below min-supported gets a
        // non-dismissable dialog — so an unpublished forced update would lock every
        // user out behind a button that opens a store without the build. Capping at
        // what is installable means a force can only ever push people somewhere they
        // can actually go; it lifts on its own once the release is live.
        int minSupported = Math.min(release.getMinSupportedVersionCode(), versionCode);

        // Likewise, a force flag set while preparing the next release must not start
        // forcing people onto the older one it is currently standing in for.
        boolean forceUpdate = release.isForceUpdate() && live;

        return new Advertised(versionName, versionCode, minSupported, forceUpdate);
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

        Advertised advertised = advertise(release);

        return new AppReleaseDto(
                "android",
                normalizedChannel,
                advertised.versionName(),
                advertised.versionCode(),
                advertised.minSupportedVersionCode(),
                advertised.forceUpdate(),
                release.getDownloadPageUrl(),
                release.getDownloadPageUrlCn(),
                release.getDownloadPasswordCn(),
                release.getPlayStoreUrl(),
                release.getBrowserPlayStoreUrl(),
                release.getApkSha256(),
                release.getApkSizeBytes(),
                release.getReleaseNotes());
    }

    /**
     * Withholding an update is silent by design, so say once at startup which
     * channels are currently holding one back — otherwise a forgotten
     * `npm run live` looks exactly like "there is no new version".
     */
    @PostConstruct
    void logPublicationGates() {
        logGate("direct", properties.getAndroid().getDirect());
        logGate("play", properties.getAndroid().getPlay());
    }

    private void logGate(String channel, Channel release) {
        int prepared = release.getLatestVersionCode();
        int published = Math.max(release.getPublishedVersionCode(), 0);
        if (published >= prepared) {
            log.info("App update channel '{}' is serving {} ({}).", channel, release.getLatestVersionName(), prepared);
        } else {
            log.warn(
                    "App update channel '{}' is holding back {} ({}): published is {} ({}). "
                            + "Clients will not be prompted until `npm run live {}` runs and the backend redeploys.",
                    channel, release.getLatestVersionName(), prepared,
                    release.getPublishedVersionName().isBlank() ? "none" : release.getPublishedVersionName(),
                    published, channel);
        }
    }

    private String normalize(String value, String fallback) {
        String v = value == null || value.isBlank() ? fallback : value;
        return v.trim().toLowerCase(Locale.ROOT);
    }
}
