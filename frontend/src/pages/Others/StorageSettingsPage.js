import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { showAlert } from "../../utils/showAlert";
import {
  init as initMediaCache,
  getUsageBytes,
  getBudgetBytes,
  setBudgetBytes,
  clearAll as clearMediaCache,
  MIN_BUDGET_BYTES,
  MAX_BUDGET_BYTES,
} from "../../service/MediaCacheService";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const STEP = 256 * MB; // snap the budget to tidy 256 MB increments
const THUMB = 22;

function formatBytes(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= GB) {
    const g = b / GB;
    return `${g % 1 === 0 ? g.toFixed(0) : g.toFixed(1)} GB`;
  }
  return `${Math.round(b / MB)} MB`;
}
function snap(bytes) {
  const clamped = Math.min(MAX_BUDGET_BYTES, Math.max(MIN_BUDGET_BYTES, bytes));
  return Math.round(clamped / STEP) * STEP;
}
function bytesToRatio(bytes) {
  return (bytes - MIN_BUDGET_BYTES) / (MAX_BUDGET_BYTES - MIN_BUDGET_BYTES);
}
function ratioToBytes(r) {
  return MIN_BUDGET_BYTES + r * (MAX_BUDGET_BYTES - MIN_BUDGET_BYTES);
}

export default function StorageSettingsPage() {
  const navigation = useNavigation();
  const { language } = useContext(LanguageContext);
  const isNative = Platform.OS !== "web";

  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(0);
  const [budget, setBudget] = useState(GB);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragRatio, setDragRatio] = useState(null); // non-null while dragging

  const trackWidthRef = useRef(0);
  const latestRatioRef = useRef(0);

  useEffect(() => {
    trackWidthRef.current = trackWidth;
  }, [trackWidth]);

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("storage"), headerBackTitle: i18n.t("back") });
  }, [language]);

  useEffect(() => {
    (async () => {
      await initMediaCache();
      const [u, b] = await Promise.all([getUsageBytes(), getBudgetBytes()]);
      setUsage(u);
      setBudget(b);
      setLoading(false);
    })();
  }, []);

  const applyBudget = async (bytes) => {
    const snapped = snap(bytes);
    setBudget(snapped);
    const finalBudget = await setBudgetBytes(snapped);
    setBudget(finalBudget);
    setUsage(await getUsageBytes()); // shrinking the limit may have evicted media
  };

  const updateFromX = (x) => {
    const w = trackWidthRef.current || 1;
    const r = Math.min(1, Math.max(0, x / w));
    latestRatioRef.current = r;
    setDragRatio(r);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => updateFromX(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        const bytes = ratioToBytes(latestRatioRef.current);
        setDragRatio(null);
        applyBudget(bytes);
      },
      onPanResponderTerminate: () => setDragRatio(null),
    })
  ).current;

  const displayBudget = dragRatio != null ? snap(ratioToBytes(dragRatio)) : budget;
  const fillRatio = dragRatio != null ? dragRatio : bytesToRatio(budget);
  const usageRatio = displayBudget > 0 ? Math.min(1, usage / displayBudget) : 0;
  const thumbLeft = fillRatio * Math.max(0, trackWidth - THUMB);

  const handleClear = () => {
    showAlert(i18n.t("clearCache"), i18n.t("clearCacheConfirm"), [
      { text: i18n.t("cancel"), style: "cancel" },
      {
        text: i18n.t("clearCache"),
        style: "destructive",
        onPress: async () => {
          await clearMediaCache();
          setUsage(await getUsageBytes());
          showAlert(i18n.t("cacheCleared"));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0A5AF6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.description}>{i18n.t("storageDescription")}</Text>

      {!isNative ? <Text style={styles.note}>{i18n.t("storageNativeOnly")}</Text> : null}

      <View style={styles.card}>
        <View style={styles.usageRow}>
          <Text style={styles.usageLabel}>{i18n.t("storageUsedLabel")}</Text>
          <Text style={styles.usageValue}>
            {formatBytes(usage)} / {formatBytes(displayBudget)}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(usageRatio * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{i18n.t("cacheLimit")}</Text>
        <Text style={styles.limitValue}>{formatBytes(displayBudget)}</Text>

        <View
          style={styles.sliderTrack}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...pan.panHandlers}
        >
          <View style={styles.sliderRail} />
          <View style={[styles.sliderFill, { width: `${Math.round(fillRatio * 100)}%` }]} />
          <View style={[styles.sliderThumb, { left: thumbLeft }]} />
        </View>
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabelText}>{formatBytes(MIN_BUDGET_BYTES)}</Text>
          <Text style={styles.sliderLabelText}>{formatBytes(MAX_BUDGET_BYTES)}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.clearButton} onPress={handleClear} activeOpacity={0.85}>
        <Text style={styles.clearButtonText}>{i18n.t("clearCache")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F2F7" },
  description: { fontSize: 14, color: "#5B6470", lineHeight: 20, marginBottom: 16 },
  note: {
    fontSize: 13,
    color: "#8A6D00",
    backgroundColor: "#FFF6DA",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1C1C1E" },
  usageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  usageLabel: { fontSize: 15, fontWeight: "600", color: "#1C1C1E" },
  usageValue: { fontSize: 15, fontWeight: "700", color: "#0A5AF6" },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5EAF2",
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#0A5AF6" },
  limitValue: { fontSize: 22, fontWeight: "800", color: "#0A5AF6", marginTop: 4, marginBottom: 14 },
  // 28px tall for a comfortable touch target; the 4px rail is centred at top:12.
  sliderTrack: {
    height: 28,
    justifyContent: "center",
  },
  sliderRail: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5EAF2",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#0A5AF6",
  },
  sliderThumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0A5AF6",
    top: 3,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  sliderLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  sliderLabelText: { fontSize: 12, color: "#8A929E", fontWeight: "600" },
  clearButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0C0C0",
    marginTop: 4,
  },
  clearButtonText: { color: "#E0463E", fontSize: 16, fontWeight: "700" },
});
