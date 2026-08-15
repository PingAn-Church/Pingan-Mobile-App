package com.fyp.backend.config.app;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

@Configuration
@ConfigurationProperties(prefix = "app.update")
@Data
public class AppUpdateProperties {

    private Android android = new Android();

    @Data
    public static class Android {
        private Channel direct = new Channel();
        private Channel play = new Channel();
    }

    @Data
    public static class Channel {
        // The release that has been BUILT and submitted. `npm run update` writes
        // these, which happens the moment the backend deploys.
        private String latestVersionName = "0.1.5";
        private int latestVersionCode = 105;
        // The release that is actually INSTALLABLE from this channel right now.
        // Play/App Store review runs for days after the backend deploys, so these
        // trail `latest-*` for as long as the store still serves the old build,
        // and `npm run live <channel>` moves them up once it goes out. Zero means
        // "nothing published yet" — clients are then told about no update at all,
        // which is the safe direction to fail in.
        private String publishedVersionName = "";
        private int publishedVersionCode = 0;
        private int minSupportedVersionCode = 105;
        private boolean forceUpdate = false;
        private String downloadPageUrl = "https://rn-app.pingan.org.sg/android";
        // China-reachable mirror (Google Drive/Play are blocked in China). The
        // frontend serves this to devices that look China-based.
        private String downloadPageUrlCn = "https://rn-app.pingan.org.sg/android";
        // Share password for the China mirror (e.g. Lanzou), shown to the user
        // before redirecting. Empty means the mirror is not password-gated.
        private String downloadPasswordCn = "";
        private String playStoreUrl = "market://details?id=org.pingan.app";
        private String browserPlayStoreUrl = "https://play.google.com/store/apps/details?id=org.pingan.app";
        private String apkSha256 = "";
        private Long apkSizeBytes;
        private Map<String, String> releaseNotes = new LinkedHashMap<>();

        public Channel() {
            releaseNotes.put("en", "Ping An 0.1.5 release.");
            releaseNotes.put("zh", "Ping An 0.1.5 版本。");
        }
    }
}
