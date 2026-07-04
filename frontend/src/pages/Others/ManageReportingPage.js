import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { getReports, resolveReport } from "../../service/ReportService";
import { getConversationDownloadUrl } from "../../service/OSSService";
import VoicePlayer from "../../components/Chat/VoicePlayer";
import { confirmAction } from "../../utils/confirmAction";
import { showAlert } from "../../utils/showAlert";
import { UserContext } from "../../context/UserContext";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";

// Voice messages store their payload as "objectUrl|durationSeconds".
const parseVoiceContent = (content) => {
  if (!content) return { audioUrl: "", duration: 0 };
  const [audioUrl, durationPart] = String(content).split("|");
  return {
    audioUrl: audioUrl || "",
    duration: Number.parseInt(durationPart, 10) || 0,
  };
};

// Backend timestamps arrive as epoch millis or an ISO-ish string.
const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(typeof value === "number" ? value : String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const typeIcon = (messageType) => {
  switch (String(messageType || "").toLowerCase()) {
    case "image":
      return "image-outline";
    case "voice":
      return "mic-outline";
    default:
      return "chatbubble-ellipses-outline";
  }
};

const resolutionLabel = (resolution) => {
  switch (resolution) {
    case "DEACTIVATE_USER":
      return i18n.t("resolutionDeactivated");
    case "DELETE_MESSAGE":
      return i18n.t("resolutionDeleted");
    case "NO_PROBLEM":
      return i18n.t("resolutionNoProblem");
    default:
      return resolution || "";
  }
};

/** Renders the reported message's content by type (text / image / voice). */
function ReportedContent({ report }) {
  const type = String(report.messageType || "").toLowerCase();
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(type === "image");

  useEffect(() => {
    let cancelled = false;
    const resolveImage = async () => {
      if (type !== "image" || !report.messageContent) return;
      try {
        const fileName = String(report.messageContent).split("?")[0].split("/").pop();
        const url = await getConversationDownloadUrl(fileName, report.conversationId);
        if (!cancelled) setImageUrl(url);
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    };
    resolveImage();
    return () => {
      cancelled = true;
    };
  }, [type, report.messageContent, report.conversationId]);

  if (type === "image") {
    if (imageLoading) return <ActivityIndicator style={styles.contentSpinner} />;
    if (!imageUrl) return <Text style={styles.contentUnavailable}>—</Text>;
    return <Image source={{ uri: imageUrl }} style={styles.contentImage} resizeMode="cover" />;
  }

  if (type === "voice") {
    const { audioUrl, duration } = parseVoiceContent(report.messageContent);
    return (
      <View style={styles.voiceWrap}>
        <VoicePlayer
          audioUrl={audioUrl}
          duration={duration}
          conversationId={report.conversationId}
        />
      </View>
    );
  }

  return <Text style={styles.contentText}>{report.messageContent}</Text>;
}

export default function ManageReportingPage() {
  const navigation = useNavigation();
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageReporting"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports();
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      showAlert(i18n.t("error"), i18n.t("loadReportsFailed"), [{ text: i18n.t("ok") }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [fetchReports])
  );

  const handleResolve = async (report, action) => {
    if (resolvingId) return; // one action at a time

    if (action !== "NO_PROBLEM") {
      const confirmed = await confirmAction({
        title: action === "DEACTIVATE_USER" ? i18n.t("deactivateUser") : i18n.t("deleteMessage"),
        message:
          action === "DEACTIVATE_USER"
            ? i18n.t("confirmDeactivateUser")
            : i18n.t("confirmDeleteMessage"),
        confirmText: i18n.t("ok"),
        cancelText: i18n.t("cancel"),
        destructive: true,
      });
      if (!confirmed) return;
    }

    setResolvingId(report.id);
    try {
      await resolveReport(report.id, action);
      await fetchReports();
    } catch (error) {
      const serverMessage =
        typeof error?.response?.data === "string" ? error.response.data : null;
      showAlert(i18n.t("error"), serverMessage || i18n.t("reportActionFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setResolvingId(null);
    }
  };

  if (!user?.admin) {
    return <Text style={styles.noAccess}>{i18n.t("notAuthorized")}</Text>;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const renderReport = ({ item }) => {
    const pending = item.status === "PENDING";
    const busy = resolvingId === item.id;

    return (
      <View style={[styles.card, pending ? styles.cardPending : styles.cardResolved]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name={typeIcon(item.messageType)} size={20} color="#4B5563" />
            <Text style={styles.senderName}>
              {i18n.t("messageSender")}: {item.senderName || "-"}
            </Text>
          </View>
          <Text style={[styles.statusChip, pending ? styles.statusPending : styles.statusResolved]}>
            {pending ? i18n.t("pendingReports") : i18n.t("resolvedReports")}
          </Text>
        </View>

        <View style={styles.contentBox}>
          <ReportedContent report={item} />
        </View>

        <Text style={styles.metaText}>
          {i18n.t("reportedBy")}: {item.reporterName || "-"} · {formatDateTime(item.reportedAt)}
        </Text>

        {pending ? (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionDanger, busy && styles.actionDisabled]}
              onPress={() => handleResolve(item, "DEACTIVATE_USER")}
              disabled={busy}
            >
              <Ionicons name="person-remove-outline" size={16} color="#fff" />
              <Text style={styles.actionText}>{i18n.t("deactivateUser")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionDanger, busy && styles.actionDisabled]}
              onPress={() => handleResolve(item, "DELETE_MESSAGE")}
              disabled={busy}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.actionText}>{i18n.t("deleteMessage")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.actionSafe, busy && styles.actionDisabled]}
              onPress={() => handleResolve(item, "NO_PROBLEM")}
              disabled={busy}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionText}>{i18n.t("noProblem")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.resolutionText}>
            {resolutionLabel(item.resolution)} · {i18n.t("resolvedBy")}: {item.resolvedByName || "-"} ·{" "}
            {formatDateTime(item.resolvedAt)}
          </Text>
        )}

        {busy && <ActivityIndicator style={styles.busySpinner} />}
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={reports}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderReport}
      ListEmptyComponent={<Text style={styles.emptyText}>{i18n.t("noReports")}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F7" },
  listContent: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  noAccess: { textAlign: "center", fontSize: 18, color: "gray", marginTop: 30 },
  emptyText: { textAlign: "center", fontSize: 16, color: "#6B7280", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
  },
  cardPending: { borderLeftColor: "#D97706" },
  cardResolved: { borderLeftColor: "#9CA3AF" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  senderName: { fontSize: 15, fontWeight: "600", color: "#111827", flexShrink: 1 },
  statusChip: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },
  statusPending: { backgroundColor: "#FEF3C7", color: "#92400E" },
  statusResolved: { backgroundColor: "#E5E7EB", color: "#374151" },
  contentBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  contentText: { fontSize: 15, color: "#111827", lineHeight: 21 },
  contentUnavailable: { fontSize: 15, color: "#9CA3AF" },
  contentImage: { width: "100%", height: 180, borderRadius: 8, backgroundColor: "#E5E7EB" },
  contentSpinner: { marginVertical: 20 },
  voiceWrap: { alignSelf: "stretch" },
  metaText: { fontSize: 13, color: "#6B7280", marginBottom: 10 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionDanger: { backgroundColor: "#DC2626" },
  actionSafe: { backgroundColor: "#059669" },
  actionDisabled: { opacity: 0.5 },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  resolutionText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  busySpinner: { marginTop: 8 },
});
