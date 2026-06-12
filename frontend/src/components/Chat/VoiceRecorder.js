import { showAlert } from "../../utils/showAlert";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";

const VoiceRecorder = ({
  onRecordingComplete,
  iconSize = 24,
  iconColor = "#007AFF",
  buttonSize = 46,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [recordedUri, setRecordedUri] = useState(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const recordingRef = useRef(null);
  const durationTimerRef = useRef(null);
  const soundRef = useRef(null);
  const controlSize = Math.max(40, buttonSize);

  useEffect(() => {
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }

      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }

      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const waveformBars = useMemo(() => [5, 9, 13, 17, 12, 8, 6, 10, 14, 18, 12, 8], []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const clearDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const resetPreviewState = async () => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    setShowPreview(false);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setRecordedUri(null);
    setRecordedDuration(0);
  };

  const startRecording = async () => {
    if (isRecording) return;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission Required", "Please allow microphone access to record voice messages.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      clearDurationTimer();
      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      showAlert("Error", "Failed to start recording. Please try again.");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      clearDurationTimer();

      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recordingRef.current.getURI();
      const duration = recordingDuration;

      recordingRef.current = null;
      setRecordingDuration(0);

      if (!uri || duration <= 0) return;

      setRecordedUri(uri);
      setRecordedDuration(duration);
      setPlaybackProgress(0);
      setShowPreview(true);
    } catch {
      showAlert("Error", "Failed to stop recording. Please try again.");
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) return;

    if (status.durationMillis && status.durationMillis > 0) {
      setPlaybackProgress(Math.min(1, status.positionMillis / status.durationMillis));
    }

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPlaybackProgress(0);
    }
  };

  const togglePlayback = async () => {
    if (!recordedUri) return;

    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: recordedUri },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );

        soundRef.current = sound;
        setIsPlaying(true);
        return;
      }

      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;

      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        const isAtEnd =
          typeof status.durationMillis === "number" &&
          typeof status.positionMillis === "number" &&
          status.durationMillis > 0 &&
          status.positionMillis >= status.durationMillis - 250;

        if (isAtEnd) {
          setPlaybackProgress(0);
          await soundRef.current.setPositionAsync(0);
        }

        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      showAlert("Error", "Failed to play recording.");
    }
  };

  const handleSend = async () => {
    if (isSending) return;
    setIsSending(true);

    const uri = recordedUri;
    const duration = recordedDuration;

    try {
      await resetPreviewState();

      if (onRecordingComplete && uri) {
        await Promise.resolve(onRecordingComplete(uri, duration));
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = async () => {
    await resetPreviewState();
  };

  return (
    <>
      <View style={styles.triggerWrap}>
        {isRecording ? (
          <View
            pointerEvents="none"
            style={[
              styles.recordingPulse,
              {
                width: controlSize + 18,
                height: controlSize + 18,
                borderRadius: (controlSize + 18) / 2,
                top: -9,
                left: -9,
              },
            ]}
          />
        ) : null}

        {isRecording ? (
          <View
            style={[
              styles.recordingBadge,
              {
                right: 0,
                bottom: controlSize + 8,
              },
            ]}
          >
            <View style={styles.recordDot} />
            <Text numberOfLines={1} style={styles.recordingBadgeText}>
              Recording {formatDuration(recordingDuration)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPressIn={startRecording}
          onPressOut={stopRecording}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.iconButton,
            {
              width: controlSize,
              height: controlSize,
              borderRadius: controlSize / 2,
            },
            isRecording ? styles.iconButtonRecording : null,
          ]}
          activeOpacity={0.85}
        >
          <Ionicons
            name="mic"
            size={isRecording ? iconSize + 4 : iconSize}
            color={isRecording ? "#FFFFFF" : iconColor}
          />
        </TouchableOpacity>
      </View>

      <Modal visible={showPreview} transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={styles.modalOverlay}>
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Voice Message</Text>

            <View style={styles.playbackRow}>
              <TouchableOpacity onPress={togglePlayback} style={styles.playButton} activeOpacity={0.85}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#0B5FFF" />
              </TouchableOpacity>

              <View style={styles.waveContainer}>
                {waveformBars.map((height, index) => {
                  const threshold = (index + 1) / waveformBars.length;
                  const active = playbackProgress >= threshold;
                  return (
                    <View
                      key={`wave-${index}`}
                      style={[
                        styles.waveBar,
                        { height },
                        active ? styles.waveBarActive : styles.waveBarInactive,
                      ]}
                    />
                  );
                })}
              </View>

              <Text style={styles.durationText}>{formatDuration(recordedDuration)}</Text>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleCancel}>
                <Ionicons name="close" size={14} color="#1F2937" />
                <Text style={[styles.actionText, styles.cancelText]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.sendButton, isSending ? styles.sendButtonDisabled : null]}
                onPress={handleSend}
                disabled={isSending}
              >
                <Ionicons name="arrow-up" size={14} color="#FFFFFF" />
                <Text style={[styles.actionText, styles.sendText]}>Send</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.previewHint}>
              {Platform.OS === "ios" ? "Preview before sending" : "Tap play to preview"}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  triggerWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingPulse: {
    position: "absolute",
    backgroundColor: "rgba(255, 59, 48, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.45)",
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D7D9E0",
    borderWidth: 1,
    borderColor: "#C5C8D1",
  },
  iconButtonRecording: {
    backgroundColor: "#FF3B30",
    borderColor: "#FF3B30",
    shadowColor: "#FF3B30",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  recordingBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 120,
    backgroundColor: "rgba(28, 28, 30, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    zIndex: 8,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF453A",
    marginRight: 6,
  },
  recordingBadgeText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "700",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  previewCard: {
    width: "100%",
    maxWidth: 342,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EDF3",
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 10,
  },
  playbackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECF3FF",
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 8,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  waveBarActive: {
    backgroundColor: "#0A5AF6",
  },
  waveBarInactive: {
    backgroundColor: "#CFD7E4",
  },
  durationText: {
    width: 40,
    textAlign: "right",
    fontSize: 11,
    color: "#5B6778",
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    marginRight: 5,
    backgroundColor: "#F4F6FA",
    borderWidth: 1,
    borderColor: "#E4E8EF",
  },
  sendButton: {
    marginLeft: 5,
    backgroundColor: "#0A5AF6",
  },
  sendButtonDisabled: {
    opacity: 0.65,
  },
  actionText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "700",
  },
  cancelText: {
    color: "#1F2937",
  },
  sendText: {
    color: "#FFFFFF",
  },
  previewHint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    color: "#7A8699",
  },
});

export default VoiceRecorder;
