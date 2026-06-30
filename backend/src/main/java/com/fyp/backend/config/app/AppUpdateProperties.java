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
        private String latestVersionName = "0.1.5";
        private int latestVersionCode = 105;
        private int minSupportedVersionCode = 105;
        private boolean forceUpdate = false;
        private String downloadPageUrl = "https://rn-app.pingan.org.sg/android";
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
