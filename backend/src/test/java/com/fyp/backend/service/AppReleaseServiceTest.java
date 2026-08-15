package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.fyp.backend.config.app.AppUpdateProperties;
import com.fyp.backend.config.app.AppUpdateProperties.Channel;
import com.fyp.backend.dto.AppReleaseDto;

/**
 * The publication gate: a built release stays invisible to clients until the
 * channel can actually install it. Pure unit tests — no Spring context, every
 * version number set explicitly so application.properties cannot sway them.
 */
class AppReleaseServiceTest {

    /** 1.0.4 built and submitted, 1.0.3 still the newest thing users can download. */
    private static Channel underReview() {
        Channel channel = new Channel();
        channel.setLatestVersionName("1.0.4");
        channel.setLatestVersionCode(10004);
        channel.setPublishedVersionName("1.0.3");
        channel.setPublishedVersionCode(10003);
        channel.setMinSupportedVersionCode(10000);
        channel.setForceUpdate(false);
        return channel;
    }

    private static AppReleaseDto latestFor(Channel channel) {
        AppUpdateProperties properties = new AppUpdateProperties();
        properties.getAndroid().setDirect(channel);
        return new AppReleaseService(properties).getLatest("android", "direct");
    }

    @Test
    void releaseUnderReviewIsNotAdvertised() {
        AppReleaseDto dto = latestFor(underReview());

        assertEquals(10003, dto.getLatestVersionCode(), "clients must not hear about the unpublished build");
        assertEquals("1.0.3", dto.getLatestVersionName());
    }

    @Test
    void publishedReleaseIsAdvertisedInFull() {
        Channel channel = underReview();
        channel.setPublishedVersionName("1.0.4");
        channel.setPublishedVersionCode(10004);

        AppReleaseDto dto = latestFor(channel);

        assertEquals(10004, dto.getLatestVersionCode());
        assertEquals("1.0.4", dto.getLatestVersionName());
    }

    @Test
    void minSupportedIsClampedSoNobodyIsLockedOutOfAnUnreleasedBuild() {
        Channel channel = underReview();
        channel.setMinSupportedVersionCode(10004); // what `npm run update patch forced-update` writes

        AppReleaseDto dto = latestFor(channel);

        // A client on 10003 is at the advertised version, so it must not be forced:
        // the only build it could be pushed to is one the store has not got yet.
        assertEquals(10003, dto.getMinSupportedVersionCode());
        assertTrue(dto.getMinSupportedVersionCode() <= dto.getLatestVersionCode());
    }

    @Test
    void minSupportedClampLiftsOnceTheReleaseIsPublished() {
        Channel channel = underReview();
        channel.setMinSupportedVersionCode(10004);
        channel.setPublishedVersionName("1.0.4");
        channel.setPublishedVersionCode(10004);

        assertEquals(10004, latestFor(channel).getMinSupportedVersionCode());
    }

    @Test
    void forceUpdateDoesNotApplyToAnUnpublishedRelease() {
        Channel channel = underReview();
        channel.setForceUpdate(true);

        assertFalse(latestFor(channel).isForceUpdate());
    }

    @Test
    void forceUpdateAppliesOnceTheReleaseIsPublished() {
        Channel channel = underReview();
        channel.setForceUpdate(true);
        channel.setPublishedVersionName("1.0.4");
        channel.setPublishedVersionCode(10004);

        assertTrue(latestFor(channel).isForceUpdate());
    }

    @Test
    void nothingPublishedYetIsInertRatherThanPromptingForVersionZero() {
        Channel channel = underReview();
        channel.setPublishedVersionName("");
        channel.setPublishedVersionCode(0);
        channel.setMinSupportedVersionCode(10004);
        channel.setForceUpdate(true);

        AppReleaseDto dto = latestFor(channel);

        // 0 is below every real client versionCode, so `latest > current` is false
        // and `current < minSupported` is false: no prompt, no lockout.
        assertEquals(0, dto.getLatestVersionCode());
        assertEquals(0, dto.getMinSupportedVersionCode());
        assertFalse(dto.isForceUpdate());
    }

    /**
     * Version numbers are sparse: several bumps can happen between two releases
     * (1.0.0 shipped, then 1.0.1/1.0.2 were built but never went out, then 1.0.3
     * shipped). Nothing here assumes the two codes are adjacent — the skipped
     * builds simply never become the published one.
     */
    @Test
    void buildsSkippedBetweenReleasesAreNeverAdvertised() {
        Channel channel = new Channel();
        channel.setPublishedVersionName("1.0.0");
        channel.setPublishedVersionCode(10000);
        channel.setMinSupportedVersionCode(10000);

        for (String[] skipped : new String[][] { { "1.0.1", "10001" }, { "1.0.2", "10002" } }) {
            channel.setLatestVersionName(skipped[0]);
            channel.setLatestVersionCode(Integer.parseInt(skipped[1]));

            AppReleaseDto dto = latestFor(channel);
            assertEquals(10000, dto.getLatestVersionCode(), skipped[0] + " was built but never released");
            assertEquals("1.0.0", dto.getLatestVersionName());
        }

        // 1.0.3 is the one that actually ships, straight over the gap.
        channel.setLatestVersionName("1.0.3");
        channel.setLatestVersionCode(10003);
        channel.setPublishedVersionName("1.0.3");
        channel.setPublishedVersionCode(10003);

        AppReleaseDto dto = latestFor(channel);
        assertEquals(10003, dto.getLatestVersionCode());
        assertEquals("1.0.3", dto.getLatestVersionName());
    }

    @Test
    void publishedAheadOfBuiltIsCappedAtWhatWasActuallyBuilt() {
        Channel channel = underReview();
        channel.setPublishedVersionName("1.1.0");
        channel.setPublishedVersionCode(10100);

        AppReleaseDto dto = latestFor(channel);

        assertEquals(10004, dto.getLatestVersionCode());
        assertEquals("1.0.4", dto.getLatestVersionName());
    }

    @Test
    void gateDoesNotDisturbTheRestOfTheReleaseMetadata() {
        Channel channel = underReview();
        channel.setDownloadPageUrl("https://example.test/apk");
        channel.setDownloadPasswordCn("518c");

        AppReleaseDto dto = latestFor(channel);

        assertEquals("android", dto.getPlatform());
        assertEquals("direct", dto.getChannel());
        assertEquals("https://example.test/apk", dto.getDownloadPageUrl());
        assertEquals("518c", dto.getDownloadPasswordCn());
    }
}
