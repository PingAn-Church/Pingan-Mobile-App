import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { markVideoComplete } from "@/services/enrollmentService";
// Reuse Pingan's web-safe webview wrapper (iframe on web, WebView on native).
import PlatformWebView from "../../components/PlatformWebView";

/** Build an embeddable URL from a YouTube watch/short/embed link, else passthrough. */
const getEmbedUrl = (url?: string): string => {
  if (!url) return "";
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/
  );
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  return url;
};

export default function VideoScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const title = String(route.params?.title ?? "Lesson");
  const videoId = route.params?.videoId ? String(route.params.videoId) : null;
  const uri = getEmbedUrl(route.params?.videoUrl);
  const [marking, setMarking] = useState(false);

  const markComplete = async () => {
    if (!videoId) return;
    setMarking(true);
    try {
      await markVideoComplete(videoId);
      Alert.alert("Marked complete", "Your progress has been updated.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update progress.");
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.videoWrapper}>
        {uri ? (
          <PlatformWebView
            source={{ uri }}
            style={styles.video}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
          />
        ) : (
          <Text style={styles.muted}>This lesson has no video.</Text>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {videoId && (
        <TouchableOpacity style={styles.completeBtn} onPress={markComplete} disabled={marking}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
          <Text style={styles.completeText}>{marking ? "Saving..." : "Mark as complete"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  videoWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  video: { flex: 1, width: "100%", height: "100%" },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    padding: 18,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary,
    marginHorizontal: 18,
    borderRadius: 12,
    paddingVertical: 14,
  },
  completeText: { color: Colors.white, fontWeight: "700", fontSize: 15 },
  muted: { color: Colors.textSecondary },
});
