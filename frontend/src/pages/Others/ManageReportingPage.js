import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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

const REPORT_PAGE_SIZE = 20;
const STATUS_PENDING = "PENDING";
const STATUS_RESOLVED = "RESOLVED";
const DEFAULT_REPORT_FILTER = "week";
const REPORT_FILTER_PRESETS = ["day", "week", "month", "all"];

const createReportPageState = () => ({
  items: [],
  page: -1,
  hasMore: true,
  totalCount: 0,
  loadingInitial: false,
  loadingMore: false,
  initialized: false,
});

const buildReportFilters = (preset = DEFAULT_REPORT_FILTER) => {
  const normalizedPreset = REPORT_FILTER_PRESETS.includes(preset) ? preset : DEFAULT_REPORT_FILTER;
  if (normalizedPreset === "all") {
    return { preset: normalizedPreset, from: "", to: "" };
  }

  const to = new Date();
  const from = new Date(to);
  if (normalizedPreset === "day") {
    from.setDate(to.getDate() - 1);
  } else if (normalizedPreset === "month") {
    from.setMonth(to.getMonth() - 1);
  } else {
    from.setDate(to.getDate() - 7);
  }

  return {
    preset: normalizedPreset,
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

const reportFilterLabel = (preset) => {
  switch (preset) {
    case "day":
      return i18n.t("reportDateLastDay");
    case "month":
      return i18n.t("reportDateLastMonth");
    case "all":
      return i18n.t("reportDateAll");
    case "week":
    default:
      return i18n.t("reportDateLastWeek");
  }
};

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

// Reports cover more than chat now; legacy rows have no contentType (= message).
const contentTypeIcon = (report) => {
  switch (String(report.contentType || "MESSAGE").toUpperCase()) {
    case "THREAD":
      return "reader-outline";
    case "THREAD_REPLY":
      return "return-down-forward-outline";
    case "COURSE_REVIEW":
      return "star-outline";
    default:
      return typeIcon(report.messageType);
  }
};

const contentTypeLabel = (report) => {
  switch (String(report.contentType || "MESSAGE").toUpperCase()) {
    case "THREAD":
      return i18n.t("reportTypeThread");
    case "THREAD_REPLY":
      return i18n.t("reportTypeReply");
    case "COURSE_REVIEW":
      return i18n.t("reportTypeReview");
    default:
      return i18n.t("reportTypeMessage");
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
    if (!imageUrl) return <Text style={styles.contentUnavailable}>-</Text>;
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
  const [pendingReports, setPendingReports] = useState(createReportPageState);
  const [resolvedReports, setResolvedReports] = useState(createReportPageState);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(() => buildReportFilters());
  const [resolvingId, setResolvingId] = useState(null);

  const pendingReportsRef = useRef(pendingReports);
  const resolvedReportsRef = useRef(resolvedReports);
  const resolvedExpandedRef = useRef(resolvedExpanded);
  const filtersRef = useRef(appliedFilters);
  const loadLocksRef = useRef({ [STATUS_PENDING]: false, [STATUS_RESOLVED]: false });
  const requestIdsRef = useRef({ [STATUS_PENDING]: 0, [STATUS_RESOLVED]: 0 });

  useEffect(() => {
    pendingReportsRef.current = pendingReports;
  }, [pendingReports]);

  useEffect(() => {
    resolvedReportsRef.current = resolvedReports;
  }, [resolvedReports]);

  useEffect(() => {
    resolvedExpandedRef.current = resolvedExpanded;
  }, [resolvedExpanded]);

  useEffect(() => {
    filtersRef.current = appliedFilters;
  }, [appliedFilters]);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("manageReporting"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language, navigation]);

  const loadReportsPage = useCallback(async (status, page = 0, append = false, filtersOverride = null) => {
    if (append && loadLocksRef.current[status]) return;

    const setReportState = status === STATUS_PENDING ? setPendingReports : setResolvedReports;
    const filters = filtersOverride || filtersRef.current;
    const requestId = requestIdsRef.current[status] + 1;
    requestIdsRef.current[status] = requestId;
    loadLocksRef.current[status] = true;
    setReportState((prev) => ({
      ...prev,
      loadingInitial: !append,
      loadingMore: append,
    }));

    try {
      const response = await getReports({
        status,
        page,
        size: REPORT_PAGE_SIZE,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const data = Array.isArray(response?.data) ? response.data : [];
      const pagination = response?.pagination || {};

      if (requestIdsRef.current[status] !== requestId) return;

      setReportState((prev) => {
        const items = append ? [...prev.items, ...data] : data;
        return {
          items,
          page: Number.isFinite(Number(pagination.page)) ? Number(pagination.page) : page,
          hasMore: Boolean(pagination.hasMore),
          totalCount:
            typeof pagination.totalCount === "number" ? pagination.totalCount : items.length,
          loadingInitial: false,
          loadingMore: false,
          initialized: true,
        };
      });
    } catch (error) {
      if (requestIdsRef.current[status] !== requestId) return;

      console.error("Failed to fetch reports:", error);
      showAlert(i18n.t("error"), i18n.t("loadReportsFailed"), [{ text: i18n.t("ok") }]);
      setReportState((prev) => ({
        ...prev,
        loadingInitial: false,
        loadingMore: false,
        initialized: true,
      }));
    } finally {
      if (requestIdsRef.current[status] === requestId) {
        loadLocksRef.current[status] = false;
      }
    }
  }, []);

  const reloadVisibleQueues = useCallback(
    async (filters = null) => {
      const effectiveFilters = filters || buildReportFilters(filtersRef.current.preset);
      filtersRef.current = effectiveFilters;
      setAppliedFilters(effectiveFilters);

      setPendingReports(createReportPageState());
      await loadReportsPage(STATUS_PENDING, 0, false, effectiveFilters);

      if (resolvedExpandedRef.current) {
        setResolvedReports(createReportPageState());
        await loadReportsPage(STATUS_RESOLVED, 0, false, effectiveFilters);
      } else {
        setResolvedReports(createReportPageState());
      }
    },
    [loadReportsPage]
  );

  useFocusEffect(
    useCallback(() => {
      if (!user?.admin) {
        setPendingReports(createReportPageState());
        setResolvedReports(createReportPageState());
        return undefined;
      }

      reloadVisibleQueues();
      return undefined;
    }, [reloadVisibleQueues, user?.admin])
  );

  const applyReportFilterPreset = useCallback((preset) => {
    const nextFilters = buildReportFilters(preset);
    filtersRef.current = nextFilters;
    setAppliedFilters(nextFilters);
    reloadVisibleQueues(nextFilters);
  }, [reloadVisibleQueues]);

  const loadNextReports = useCallback(
    (status) => {
      const state = status === STATUS_PENDING ? pendingReportsRef.current : resolvedReportsRef.current;
      if (!state.initialized || state.loadingInitial || state.loadingMore || !state.hasMore) return;
      loadReportsPage(status, state.page + 1, true);
    },
    [loadReportsPage]
  );

  const loadNextReportsRef = useRef(loadNextReports);
  useEffect(() => {
    loadNextReportsRef.current = loadNextReports;
  }, [loadNextReports]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.rowType === "loadMore") {
        loadNextReportsRef.current(item.status);
      }
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  const handleToggleResolved = useCallback(() => {
    const nextExpanded = !resolvedExpandedRef.current;
    resolvedExpandedRef.current = nextExpanded;
    setResolvedExpanded(nextExpanded);

    if (nextExpanded && !resolvedReportsRef.current.initialized) {
      loadReportsPage(STATUS_RESOLVED, 0, false);
    }
  }, [loadReportsPage]);

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
      await reloadVisibleQueues();
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

  const listRows = useMemo(() => {
    const rows = [
      {
        rowType: "sectionHeader",
        key: "pending-header",
        status: STATUS_PENDING,
        title: i18n.t("pendingReports"),
        count: pendingReports.initialized ? pendingReports.totalCount : null,
      },
    ];

    if (pendingReports.loadingInitial && !pendingReports.initialized) {
      rows.push({ rowType: "loading", key: "pending-loading" });
    } else if (pendingReports.initialized && pendingReports.items.length === 0) {
      rows.push({ rowType: "empty", key: "pending-empty", label: i18n.t("noReports") });
    } else {
      pendingReports.items.forEach((report) =>
        rows.push({ rowType: "report", key: `pending-${report.id}`, report })
      );
    }

    if (pendingReports.initialized && pendingReports.hasMore) {
      rows.push({
        rowType: "loadMore",
        key: `pending-load-more-${pendingReports.page}`,
        status: STATUS_PENDING,
      });
    }

    rows.push({
      rowType: "resolvedToggle",
      key: "resolved-toggle",
    });

    if (resolvedExpanded) {
      rows.push({
        rowType: "sectionHeader",
        key: "resolved-header",
        status: STATUS_RESOLVED,
        title: i18n.t("resolvedReports"),
        count: resolvedReports.initialized ? resolvedReports.totalCount : null,
      });

      if (resolvedReports.loadingInitial && !resolvedReports.initialized) {
        rows.push({ rowType: "loading", key: "resolved-loading" });
      } else if (resolvedReports.initialized && resolvedReports.items.length === 0) {
        rows.push({ rowType: "empty", key: "resolved-empty", label: i18n.t("noReports") });
      } else {
        resolvedReports.items.forEach((report) =>
          rows.push({ rowType: "report", key: `resolved-${report.id}`, report })
        );
      }

      if (resolvedReports.initialized && resolvedReports.hasMore) {
        rows.push({
          rowType: "loadMore",
          key: `resolved-load-more-${resolvedReports.page}`,
          status: STATUS_RESOLVED,
        });
      }
    }

    return rows;
  }, [language, pendingReports, resolvedExpanded, resolvedReports]);

  const filterControls = (
    <View style={styles.filterCard}>
      <Text style={styles.filterTitle}>{i18n.t("reportDateFilter")}</Text>
      <View style={styles.filterPresetRow}>
        {REPORT_FILTER_PRESETS.map((preset) => {
          const active = appliedFilters.preset === preset;
          return (
            <TouchableOpacity
              key={preset}
              style={[styles.filterPresetButton, active && styles.filterPresetButtonActive]}
              onPress={() => applyReportFilterPreset(preset)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.filterPresetText, active && styles.filterPresetTextActive]}
              >
                {reportFilterLabel(preset)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderReportCard = (item) => {
    const pending = item.status === STATUS_PENDING;
    const busy = resolvingId === item.id;

    return (
      <View style={[styles.card, pending ? styles.cardPending : styles.cardResolved]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name={contentTypeIcon(item)} size={20} color="#4B5563" />
            <Text style={styles.senderName}>
              {i18n.t("messageSender")}: {item.senderName || "-"}
            </Text>
          </View>
          <Text style={[styles.statusChip, pending ? styles.statusPending : styles.statusResolved]}>
            {pending ? i18n.t("pendingReports") : i18n.t("resolvedReports")}
          </Text>
        </View>

        <Text style={styles.contentTypeText}>{contentTypeLabel(item)}</Text>

        <View style={styles.contentBox}>
          <ReportedContent report={item} />
        </View>

        <Text style={styles.metaText}>
          {i18n.t("reportedBy")}: {item.reporterName || "-"} - {formatDateTime(item.reportedAt)}
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
            {resolutionLabel(item.resolution)} - {i18n.t("resolvedBy")}: {item.resolvedByName || "-"} -{" "}
            {formatDateTime(item.resolvedAt)}
          </Text>
        )}

        {busy && <ActivityIndicator style={styles.busySpinner} />}
      </View>
    );
  };

  const renderListRow = ({ item }) => {
    switch (item.rowType) {
      case "sectionHeader":
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{item.title}</Text>
            {typeof item.count === "number" ? (
              <Text style={styles.sectionCount}>{item.count}</Text>
            ) : null}
          </View>
        );
      case "report":
        return renderReportCard(item.report);
      case "loading":
        return <ActivityIndicator style={styles.sectionSpinner} />;
      case "empty":
        return <Text style={styles.emptyText}>{item.label}</Text>;
      case "loadMore":
        return (
          <View style={styles.loadMoreRow}>
            <ActivityIndicator size="small" color="#4B5563" />
            <Text style={styles.loadMoreText}>{i18n.t("loadingMoreReports")}</Text>
          </View>
        );
      case "resolvedToggle":
        return (
          <TouchableOpacity
            style={styles.resolvedToggle}
            onPress={handleToggleResolved}
            activeOpacity={0.85}
          >
            <View>
              <Text style={styles.resolvedToggleTitle}>{i18n.t("resolvedReports")}</Text>
              <Text style={styles.resolvedToggleSubtitle}>
                {resolvedExpanded
                  ? i18n.t("hideResolvedReports")
                  : i18n.t("showResolvedReports")}
              </Text>
            </View>
            <Ionicons
              name={resolvedExpanded ? "chevron-up" : "chevron-down"}
              size={22}
              color="#4B5563"
            />
          </TouchableOpacity>
        );
      default:
        return null;
    }
  };

  if (!user?.admin) {
    return <Text style={styles.noAccess}>{i18n.t("notAuthorized")}</Text>;
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={listRows}
      keyExtractor={(item) => item.key}
      renderItem={renderListRow}
      ListHeaderComponent={filterControls}
      keyboardShouldPersistTaps="handled"
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F7" },
  listContent: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  noAccess: { textAlign: "center", fontSize: 18, color: "gray", marginTop: 30 },
  filterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  filterPresetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPresetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPresetButtonActive: {
    backgroundColor: "#0A84FF",
    borderColor: "#0A84FF",
  },
  filterPresetText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  filterPresetTextActive: {
    color: "#FFFFFF",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  sectionSpinner: {
    marginVertical: 18,
  },
  emptyText: { textAlign: "center", fontSize: 16, color: "#6B7280", marginVertical: 24 },
  resolvedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  resolvedToggleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  resolvedToggleSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  loadMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  loadMoreText: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "600",
  },
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
  contentTypeText: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginBottom: 6 },
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
