import React, { useContext, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import { markResourceComplete } from "@/services/enrollmentService";
import { notify } from "@/utils/alerts";
import PlatformWebView from "../../components/PlatformWebView";
import { useAuth } from "@/context/AuthContext";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";

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
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  useContext(LanguageContext);
  const title = String(route.params?.title ?? i18n.t("document"));
  const rawUrl: string | undefined = route.params?.resourceUrl;
  const resourceId = route.params?.resourceId ? String(route.params.resourceId) : null;
  const courseId = route.params?.courseId ? String(route.params.courseId) : null;
  const uri = viewerUrl(rawUrl, route.params?.resourceType);
  const { height: windowHeight } = useWindowDimensions();
  // The embedded viewer needs a definite height — flex:1 collapses the WebView
  // on phones. How much room is actually left over depends on the navigation
  // header, the status/safe area, this screen's own title row and whether the
  // complete button is showing; subtracting a guessed constant from the window
  // left the document squeezed into a short letterbox on some devices. So a
  // flex:1 wrapper claims whatever remains and reports its real height, and the
  // WebView is given exactly that. The wrapper is sized by flex rather than by
  // its child, so feeding the measurement back in cannot loop.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const viewerHeight =
    measuredHeight > 0
      ? measuredHeight
      : // First frame only, before onLayout has run.
        Math.max(windowHeight - (resourceId ? 170 : 90), 320);
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
      notify(i18n.t("markedComplete"), i18n.t("progressUpdated"), () => navigation.goBack());
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("progressUpdateFailed"));
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
            <Ionicons name="open-outline" size={theme.sizes.icon.sm} color={colors.onAccent} />
            <Text style={styles.openBtnText}>{i18n.t("open")}</Text>
          </TouchableOpacity>
        )}
      </View>
      {uri ? (
        <View
          style={styles.viewerFill}
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            // A zero here is a layout pass that hasn't settled, not a viewer
            // with no room — keep the last good value rather than collapsing.
            if (height > 0) setMeasuredHeight(height);
          }}
        >
          <PlatformWebView
            source={{ uri }}
            style={[styles.viewer, { height: viewerHeight }]}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : (
        <Text style={styles.muted}>{i18n.t("resourceUnavailable")}</Text>
      )}
      {isAuthenticated && resourceId &&
        (completed ? (
          <View style={[styles.completeBtn, styles.completedBtn]}>
            <Ionicons name="checkmark-circle" size={theme.sizes.icon.sm} color={colors.onAccent} />
            <Text style={styles.completeText}>{i18n.t("completed")}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.completeBtn} onPress={markComplete} disabled={marking}>
            <Ionicons name="checkmark-circle-outline" size={theme.sizes.icon.sm} color={colors.onAccent} />
            <Text style={styles.completeText}>
              {marking ? i18n.t("saving") : i18n.t("markAsComplete")}
            </Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: t.spacing.base,
    },
    title: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold, flex: 1, marginRight: t.spacing.md },
    openBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.sm,
      backgroundColor: lc.accent,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.control,
    },
    openBtnText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.semibold },
    // Claims every pixel the header and complete button leave behind; its measured
    // height is what the WebView is then given.
    viewerFill: { flex: 1 },
    viewer: { width: "100%", backgroundColor: lc.onAccent },
    completeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: t.spacing.sm,
      backgroundColor: lc.accent,
      margin: t.spacing.base,
      borderRadius: t.radius.control,
      paddingVertical: t.spacing.base,
    },
    completedBtn: { backgroundColor: lc.success },
    completeText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.bold, fontSize: t.typography.fontSize.md },
    muted: { color: lc.textSecondary, padding: t.spacing.lg },
  };
});
