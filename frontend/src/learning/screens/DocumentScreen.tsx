import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { markResourceComplete } from "@/services/enrollmentService";
import { notify } from "@/utils/alerts";
import PlatformWebView from "../../components/PlatformWebView";

/**
 * Google Docs/Drive share links point at the editor page, which the gview
 * wrapper can't render ("No preview available") — swap them for the
 * document's own embeddable /preview page instead. The doc must be shared
 * as "Anyone with the link" for learners to see it.
 */
const googlePreviewUrl = (url: string): string | null => {
  const docs = url.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/?#]+)/);
  if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/preview`;
  const file = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (file) return `https://drive.google.com/file/d/${file[1]}/preview`;
  const open = url.match(/drive\.google\.com\/open\?id=([^&#]+)/);
  if (open) return `https://drive.google.com/file/d/${open[1]}/preview`;
  return null;
};

/** Wrap office/pdf documents in the Google viewer; load others directly. */
const viewerUrl = (url?: string, type?: string): string => {
  if (!url) return "";
  const google = googlePreviewUrl(url);
  if (google) return google;
  const officeLike = ["pdf", "document", "ppt", "doc", "docx", "pptx"];
  if (type && officeLike.includes(type.toLowerCase())) {
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
  }
  return url;
};

export default function DocumentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const title = String(route.params?.title ?? "Document");
  const rawUrl: string | undefined = route.params?.resourceUrl;
  const resourceId = route.params?.resourceId ? String(route.params.resourceId) : null;
  const courseId = route.params?.courseId ? String(route.params.courseId) : null;
  const uri = viewerUrl(rawUrl, route.params?.resourceType);
  const { height: windowHeight } = useWindowDimensions();
  // The embedded viewer needs a definite height — flex:1 collapses the WebView
  // on phones — so size it to the screen (minus header + complete button) and
  // let it scale across devices and orientations.
  const viewerHeight = Math.max(windowHeight - (resourceId ? 170 : 90), 320);
  const [marking, setMarking] = useState(false);
  const [completed, setCompleted] = useState<boolean>(!!route.params?.isCompleted);

  const markComplete = async () => {
    if (!resourceId) return;
    setMarking(true);
    try {
      await markResourceComplete(resourceId);
      setCompleted(true);
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: ["learning", "course", courseId] });
        queryClient.invalidateQueries({ queryKey: ["learning", "my-courses"] });
      }
      notify("Marked complete", "Your progress has been updated.", () => navigation.goBack());
    } catch (e: any) {
      notify("Error", e?.message || "Could not update progress.");
    } finally {
      setMarking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!rawUrl && (
          <TouchableOpacity style={styles.openBtn} onPress={() => Linking.openURL(rawUrl)}>
            <Ionicons name="open-outline" size={18} color={Colors.white} />
            <Text style={styles.openBtnText}>Open</Text>
          </TouchableOpacity>
        )}
      </View>
      {uri ? (
        <PlatformWebView
          source={{ uri }}
          style={[styles.viewer, { height: viewerHeight }]}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <Text style={styles.muted}>This resource is unavailable.</Text>
      )}
      {resourceId &&
        (completed ? (
          <View style={[styles.completeBtn, styles.completedBtn]}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
            <Text style={styles.completeText}>Completed</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.completeBtn} onPress={markComplete} disabled={marking}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
            <Text style={styles.completeText}>{marking ? "Saving..." : "Mark as complete"}</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1, marginRight: 12 },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  openBtnText: { color: Colors.white, fontWeight: "600" },
  viewer: { width: "100%", backgroundColor: Colors.white },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary,
    margin: 14,
    borderRadius: 12,
    paddingVertical: 14,
  },
  completedBtn: { backgroundColor: Colors.green },
  completeText: { color: Colors.white, fontWeight: "700", fontSize: 15 },
  muted: { color: Colors.textSecondary, padding: 18 },
});
