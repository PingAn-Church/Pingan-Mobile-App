import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import PlatformWebView from "../../components/PlatformWebView";

/** Wrap office/pdf documents in the Google viewer; load others directly. */
const viewerUrl = (url?: string, type?: string): string => {
  if (!url) return "";
  const officeLike = ["pdf", "document", "ppt", "doc", "docx", "pptx"];
  if (type && officeLike.includes(type.toLowerCase())) {
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
  }
  return url;
};

export default function DocumentScreen() {
  const route = useRoute<any>();
  const title = String(route.params?.title ?? "Document");
  const rawUrl: string | undefined = route.params?.resourceUrl;
  const uri = viewerUrl(rawUrl, route.params?.resourceType);

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
          style={styles.viewer}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <Text style={styles.muted}>This resource is unavailable.</Text>
      )}
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
  viewer: { flex: 1, backgroundColor: Colors.white },
  muted: { color: Colors.textSecondary, padding: 18 },
});
