import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { markResourceComplete } from "@/services/enrollmentService";
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
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const title = String(route.params?.title ?? "Document");
  const rawUrl: string | undefined = route.params?.resourceUrl;
  const resourceId = route.params?.resourceId ? String(route.params.resourceId) : null;
  const uri = viewerUrl(rawUrl, route.params?.resourceType);
  const [marking, setMarking] = useState(false);

  const markComplete = async () => {
    if (!resourceId) return;
    setMarking(true);
    try {
      await markResourceComplete(resourceId);
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
      {resourceId && (
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
  completeText: { color: Colors.white, fontWeight: "700", fontSize: 15 },
  muted: { color: Colors.textSecondary, padding: 18 },
});
