import React, { useContext, useEffect, useRef, useState } from "react";
import {
  View,
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
import { makeStyles, useTheme } from "../../theme";
import { AppText, Card } from "../../components/ui";
import {
  init as initMediaCache,
  getUsageBytes,
  getBudgetBytes,
  setBudgetBytes,
  clearAll as clearMediaCache,
  MIN_BUDGET_BYTES,
  MAX_BUDGET_BYTES,
} from "../../service/MediaCacheService";
import { clearLocalSpiritualGiftCache } from "../../features/spiritualGifts/spiritualGiftService";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const STEP = 256 * MB; // snap the budget to tidy 256 MB increments
const THUMB = 22;
const SLIDER_HEIGHT = 28; // touch area of the slider
const RAIL_HEIGHT = 4; // slider rail and its blue fill
const THUMB_TOP = 3; // centres the knob in the slider
const RAIL_TOP = 12; // centres the rail and fill in the slider
const PROGRESS_HEIGHT = 8; // "storage used" bar
const NOTICE_RADIUS = 8; // corners of the web-only notice
// Light shadow under the slider knob.
const THUMB_SHADOW = Platform.select({
  web: { boxShadow: "0px 1px 3px rgba(0,0,0,0.18)" },
  default: {
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});

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
  const styles = useStyles();
  const { colors } = useTheme();
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
          await Promise.all([clearMediaCache(), clearLocalSpiritualGiftCache()]);
          setUsage(await getUsageBytes());
          showAlert(i18n.t("cacheCleared"));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={i18n.t("loading")} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppText variant="secondary" style={styles.description}>
        {i18n.t("storageDescription")}
      </AppText>

      {!isNative ? (
        <AppText variant="secondary" style={styles.note}>
          {i18n.t("storageNativeOnly")}
        </AppText>
      ) : null}

      <Card variant="default" style={styles.card}>
        <View style={styles.usageRow}>
          <AppText variant="cardTitleSmall" accessibilityRole="header">
            {i18n.t("storageUsedLabel")}
          </AppText>
          <AppText weight="bold" color="primary">
            {formatBytes(usage)} / {formatBytes(displayBudget)}
          </AppText>
        </View>
        <View
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={i18n.t("storageUsedLabel")}
        >
          <View style={[styles.progressFill, { width: `${Math.round(usageRatio * 100)}%` }]} />
        </View>
      </Card>

      <Card variant="default" style={styles.card}>
        <AppText variant="cardTitleSmall" accessibilityRole="header">
          {i18n.t("cacheLimit")}
        </AppText>
        <AppText size="xl" weight="bold" color="primary" style={styles.limitValue}>
          {formatBytes(displayBudget)}
        </AppText>

        <View
          style={styles.sliderTrack}
          accessible
          accessibilityLabel={`${i18n.t("cacheLimit")}, ${formatBytes(displayBudget)}`}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...pan.panHandlers}
        >
          <View style={styles.sliderRail} />
          <View style={[styles.sliderFill, { width: `${Math.round(fillRatio * 100)}%` }]} />
          <View style={[styles.sliderThumb, { left: thumbLeft }]} />
        </View>
        <View style={styles.sliderLabels}>
          <AppText
            variant="caption"
            weight="semibold"
            accessibilityLabel={`${i18n.t("minimum")}, ${formatBytes(MIN_BUDGET_BYTES)}`}
          >
            {formatBytes(MIN_BUDGET_BYTES)}
          </AppText>
          <AppText
            variant="caption"
            weight="semibold"
            accessibilityLabel={`${i18n.t("maximum")}, ${formatBytes(MAX_BUDGET_BYTES)}`}
          >
            {formatBytes(MAX_BUDGET_BYTES)}
          </AppText>
        </View>
      </Card>

      <TouchableOpacity
        style={styles.clearButton}
        onPress={handleClear}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <AppText variant="button" size="md" color="danger">
          {i18n.t("clearCache")}
        </AppText>
      </TouchableOpacity>
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.backgroundMuted },
  content: { padding: t.spacing.lg, paddingBottom: t.spacing["3xl"] },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.colors.backgroundMuted,
  },
  description: { marginBottom: t.spacing.base },
  note: {
    color: t.colors.storage.noticeText,
    backgroundColor: t.colors.storage.notice,
    borderRadius: NOTICE_RADIUS,
    padding: t.spacing.md,
    marginBottom: t.spacing.base,
  },
  card: { marginBottom: t.spacing.base },
  usageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
    marginTop: t.spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: t.radius.full, backgroundColor: t.colors.primary },
  limitValue: { marginTop: t.spacing.xs, marginBottom: t.spacing.base },
  // 28px tall for a comfortable touch target; the 4px rail is centred at top:12.
  sliderTrack: {
    height: SLIDER_HEIGHT,
    justifyContent: "center",
  },
  sliderRail: {
    position: "absolute",
    left: 0,
    right: 0,
    top: RAIL_TOP,
    height: RAIL_HEIGHT,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceMuted,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: RAIL_TOP,
    height: RAIL_HEIGHT,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primary,
  },
  sliderThumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surface,
    borderWidth: 2,
    borderColor: t.colors.primary,
    top: THUMB_TOP,
    ...THUMB_SHADOW,
  },
  sliderLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: t.spacing.md },
  clearButton: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.control,
    paddingVertical: t.components.button.paddingVertical,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.colors.storage.clearBorder,
    marginTop: t.spacing.xs,
  },
}));
