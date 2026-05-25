import React, { useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { getConversationDownloadUrl } from "../../service/OSSService";

const VoicePlayer = ({ audioUrl, duration, conversationId, isMe = false }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState((duration || 0) * 1000);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState(null);
  const waveformBars = useMemo(() => [4, 8, 12, 16, 10, 6, 9, 14, 18, 13, 8, 5, 10, 15, 12, 7], []);

  // Resolve the presigned URL for the audio file
  useEffect(() => {
    const resolveUrl = async () => {
      if (!audioUrl) return;
      
      try {
        // If it's an S3 object key, resolve it to a presigned URL
        if (audioUrl.includes("voice_") && conversationId) {
          const fileName = audioUrl.split("/").pop();
          const presignedUrl = await getConversationDownloadUrl(fileName, conversationId);
          setResolvedAudioUrl(presignedUrl);
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

  useEffect(() => {
    return () => {
      // Cleanup: unload sound when component unmounts
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  useEffect(() => {
    setTotalDuration((duration || 0) * 1000);
  }, [duration]);

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const playSound = async () => {
    try {
      if (!resolvedAudioUrl) {
        console.warn("Audio URL not resolved yet");
        return;
      }

      setIsLoading(true);

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      if (!sound) {
        // Load the sound for the first time
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: resolvedAudioUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
      } else {
        const status = await sound.getStatusAsync();
        const isAtEnd =
          status?.isLoaded &&
          typeof status.durationMillis === "number" &&
          typeof status.positionMillis === "number" &&
          status.positionMillis >= status.durationMillis - 200;

        if (isAtEnd) {
          await sound.setPositionAsync(0);
          setPosition(0);
        }

        // Resume playing
        await sound.playAsync();
        setIsPlaying(true);
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error playing sound:", error);
      setIsLoading(false);
    }
  };

  const pauseSound = async () => {
    try {
      if (sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Error pausing sound:", error);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      if (typeof status.durationMillis === "number" && status.durationMillis > 0) {
        setTotalDuration(status.durationMillis);
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseSound();
    } else {
      playSound();
    }
  };

  const totalDurationMs = totalDuration > 0 ? totalDuration : (duration || 0) * 1000;
  const progressRatio = totalDurationMs > 0 ? Math.min(1, Math.max(0, position / totalDurationMs)) : 0;
  const activeBars = Math.floor(progressRatio * waveformBars.length);
  const displayDuration = formatTime(totalDurationMs);
  const displayPosition = formatTime(position);
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
