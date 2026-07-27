import React, { useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { getConversationDownloadUrl } from "../../service/OSSService";
import { getLocalUri as getCachedMedia } from "../../service/MediaCacheService";

const VoicePlayer = ({ audioUrl, duration, conversationId, isMe = false }) => {
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState(null);
  const waveformBars = useMemo(() => [4, 8, 12, 16, 10, 6, 9, 14, 18, 13, 8, 5, 10, 15, 12, 7], []);

  // expo-audio is hook-based, so the player can't be created on demand the way
  // Audio.Sound.createAsync was. useAudioPlayer keys on the source, so passing
  // the URL as soon as it resolves swaps the player over and releases the old
  // one — which also covers unmount, so there's no unload effect any more.
  const player = useAudioPlayer(resolvedAudioUrl ? { uri: resolvedAudioUrl } : null);
  const status = useAudioPlayerStatus(player);

  // Resolve the presigned URL for the audio file
  useEffect(() => {
    const resolveUrl = async () => {
      if (!audioUrl) return;
      
      try {
        // If it's an S3 object key, serve from the on-device cache (downloads once
        // on a miss) and fall back to a presigned URL only if it couldn't be cached.
        if (audioUrl.includes("voice_") && conversationId) {
          const fileName = audioUrl.split("/").pop();
          const resolveRemote = () => getConversationDownloadUrl(fileName, conversationId);
          const local = await getCachedMedia(audioUrl, resolveRemote);
          setResolvedAudioUrl(local || (await resolveRemote()));
        } else {
          // If it's already a full URL, use it directly
          setResolvedAudioUrl(audioUrl);
        }
      } catch (error) {
        console.error("Error resolving audio URL:", error);
        setResolvedAudioUrl(audioUrl); // Fallback to original URL
      }
    };

    resolveUrl();
  }, [audioUrl, conversationId]);

  // expo-audio reports seconds, where expo-av reported milliseconds. The
  // `duration` prop is seconds too — it comes off the message record — so the
  // whole component now works in one unit instead of converting at the edges.
  const formatTime = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isPlaying = status.playing;
  const isLoading = !resolvedAudioUrl || status.isBuffering;

  // Fall back to the prop until the player has loaded enough to report its own
  // duration, so the bubble shows a sensible length before first play.
  const totalSeconds = status.duration > 0 ? status.duration : duration || 0;
  // Once finished the player parks at the end; show it back at zero, matching
  // the old didJustFinish reset.
  const positionSeconds = status.didJustFinish ? 0 : status.currentTime || 0;

  const handlePlayPause = async () => {
    if (!resolvedAudioUrl) {
      console.warn("Audio URL not resolved yet");
      return;
    }

    try {
      if (isPlaying) {
        player.pause();
        return;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "duckOthers",
      });

      // Starting from the end should replay rather than sit there finished.
      if (status.didJustFinish || (totalSeconds > 0 && status.currentTime >= totalSeconds - 0.2)) {
        await player.seekTo(0);
      }

      player.play();
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  const progressRatio = totalSeconds > 0 ? Math.min(1, Math.max(0, positionSeconds / totalSeconds)) : 0;
  const activeBars = Math.floor(progressRatio * waveformBars.length);
  const displayDuration = formatTime(totalSeconds);
  const displayPosition = formatTime(positionSeconds);
  const palette = isMe
    ? {
        playButtonBg: "#FFFFFF",
        playIcon: "#0A84FF",
        waveRowBg: "rgba(255, 255, 255, 0.22)",
        waveActive: "#FFFFFF",
        waveInactive: "rgba(255, 255, 255, 0.5)",
        currentTime: "#FFFFFF",
        divider: "rgba(255, 255, 255, 0.58)",
        totalTime: "rgba(255, 255, 255, 0.82)",
      }
    : {
        playButtonBg: "#0A84FF",
        playIcon: "#FFFFFF",
        waveRowBg: "rgba(15, 23, 42, 0.06)",
        waveActive: "#0A84FF",
        waveInactive: "rgba(15, 23, 42, 0.2)",
        currentTime: "#0A84FF",
        divider: "rgba(15, 23, 42, 0.25)",
        totalTime: "rgba(15, 23, 42, 0.56)",
      };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handlePlayPause}
        disabled={isLoading}
        style={[styles.playButton, { backgroundColor: palette.playButtonBg }]}
        activeOpacity={0.86}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={palette.playIcon} />
        ) : (
          <Ionicons name={isPlaying ? "pause" : "play"} size={17} color={palette.playIcon} />
        )}
      </TouchableOpacity>

      <View style={styles.waveformContainer}>
        <View style={[styles.waveRow, { backgroundColor: palette.waveRowBg }]}>
          {waveformBars.map((height, index) => (
            <View
              key={`bar-${index}`}
              style={[
                styles.waveBar,
                { height },
                { backgroundColor: index < activeBars ? palette.waveActive : palette.waveInactive },
              ]}
            />
          ))}
        </View>
        <View style={styles.timeRow}>
          <Text style={[styles.currentTimeText, { color: palette.currentTime }]}>{displayPosition}</Text>
          <View style={[styles.timeDividerDot, { backgroundColor: palette.divider }]} />
          <Text style={[styles.totalTimeText, { color: palette.totalTime }]}>{displayDuration}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0A84FF",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  waveformContainer: {
    flex: 1,
    justifyContent: "center",
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  waveBar: {
    width: 3,
    borderRadius: 999,
  },
  timeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  currentTimeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  timeDividerDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 6,
  },
  totalTimeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
});

export default VoicePlayer;
