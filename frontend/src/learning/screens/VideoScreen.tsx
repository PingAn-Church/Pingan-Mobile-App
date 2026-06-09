import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
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
  const route = useRoute<any>();
  const title = String(route.params?.title ?? "Lesson");
  const uri = getEmbedUrl(route.params?.videoUrl);

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
  muted: { color: Colors.textSecondary },
});
