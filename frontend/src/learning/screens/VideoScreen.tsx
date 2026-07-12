import React, { useContext, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { markVideoComplete } from "@/services/enrollmentService";
import { notify } from "@/utils/alerts";
// Reuse Pingan's web-safe webview wrapper (iframe on web, WebView on native).
import PlatformWebView from "../../components/PlatformWebView";
import { useAuth } from "@/context/AuthContext";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";

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
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  useContext(LanguageContext);
  const title = String(route.params?.title ?? i18n.t("lesson"));
  const videoId = route.params?.videoId ? String(route.params.videoId) : null;
  const courseId = route.params?.courseId ? String(route.params.courseId) : null;
  const uri = getEmbedUrl(route.params?.videoUrl);
  const [marking, setMarking] = useState(false);
  const [completed, setCompleted] = useState<boolean>(!!route.params?.isCompleted);
  const { width, height } = useWindowDimensions();
  // 16:9 at full width, but never taller than ~60% of the window so the title
  // and mark-complete button stay on screen on landscape tablets.
  const videoHeight = Math.min(width * (9 / 16), height * 0.6);
  const videoWidth = videoHeight * (16 / 9);

  const markComplete = async () => {
    if (!videoId) return;
    setMarking(true);
    try {
      await markVideoComplete(videoId);
      setCompleted(true);
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: ["learning", "course", courseId] });
        queryClient.invalidateQueries({ queryKey: ["learning", "my-courses"] });
      }
      notify(i18n.t("markedComplete"), i18n.t("progressUpdated"), () => navigation.goBack());
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("progressUpdateFailed"));
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.videoWrapper, { width: videoWidth, height: videoHeight }]}>
        {uri ? (
          <PlatformWebView
            source={{ uri }}
            style={styles.video}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
          />
        ) : (
          <Text style={styles.muted}>{i18n.t("lessonVideoUnavailable")}</Text>
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {isAuthenticated && videoId &&
        (completed ? (
          <View style={[styles.completeBtn, styles.completedBtn]}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
            <Text style={styles.completeText}>{i18n.t("completed")}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.completeBtn} onPress={markComplete} disabled={marking}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
            <Text style={styles.completeText}>
              {marking ? i18n.t("saving") : i18n.t("markAsComplete")}
            </Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  videoWrapper: {
    alignSelf: "center",
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
  completedBtn: { backgroundColor: Colors.green },
  completeText: { color: Colors.white, fontWeight: "700", fontSize: 15 },
  muted: { color: Colors.textSecondary },
});
