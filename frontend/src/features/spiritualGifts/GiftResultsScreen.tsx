import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";
import GiftExplanationModal from "./GiftExplanationModal";
import {
  isValidResult,
  SPIRITUAL_GIFTS,
  type SpiritualGiftDefinition,
  type SpiritualGiftResult,
  type SupportedLanguage,
} from "./spiritualGiftData";
import {
  getGuestSpiritualGiftResult,
  getMySpiritualGiftResult,
} from "./spiritualGiftService";

interface RankedGift {
  gift: SpiritualGiftDefinition;
  score: number;
  index: number;
  rank: number;
}

export default function GiftResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const locale: SupportedLanguage = language === "en" ? "en" : "zh";
  const { width } = useWindowDimensions();

  const routeResult = isValidResult(route.params?.result) ? route.params.result : null;
  const [result, setResult] = useState<SpiritualGiftResult | null>(routeResult);
  const [loading, setLoading] = useState(!routeResult);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedGift, setSelectedGift] = useState<SpiritualGiftDefinition | null>(null);
  const [showTies, setShowTies] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("giftResults") });
  }, [language, navigation]);

  useEffect(() => {
    if (!routeResult) loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadResult = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const latest = user
        ? await getMySpiritualGiftResult()
        : await getGuestSpiritualGiftResult();
      if (!latest) {
        navigation.replace("GiftDiscovery");
        return;
      }
      setResult(latest);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const ranked = useMemo<RankedGift[]>(() => {
    if (!result) return [];
    const sorted = SPIRITUAL_GIFTS.map((gift, index) => ({
      gift,
      score: result.scores[index],
      index,
      rank: 0,
    })).sort((a, b) => b.score - a.score || a.index - b.index);

    let previousScore: number | null = null;
    let previousRank = 0;
    return sorted.map((item, index) => {
      const rank = previousScore === item.score ? previousRank : index + 1;
      previousScore = item.score;
      previousRank = rank;
      return { ...item, rank };
    });
  }, [result]);

  const topCutoff = ranked[2]?.score ?? -1;
  const allTop = ranked.filter((item) => item.score >= topCutoff);
  const visibleTop = allTop.slice(0, 3);
  const hiddenTop = allTop.slice(3);
  const contentWidth = Math.min(width - 28, 760);

  const copyResult = async () => {
    if (!result) return;
    const date = new Date(result.completedAt).toLocaleDateString(locale === "en" ? "en-SG" : "zh-CN");
    const title = locale === "en" ? "Spiritual Gift Discovery Results" : "属灵恩赐自测结果";
    const topTitle = locale === "en" ? "Leading gifts" : "主要恩赐";
    const allTitle = locale === "en" ? "All scores" : "全部得分";
    const lines = [
      title,
      `${locale === "en" ? "Completed" : "完成日期"}: ${date}`,
      "",
      `${topTitle}: ${allTop.map((item) => `${item.gift.name[locale]} (${item.score}/15)`).join(", ")}`,
      "",
      `${allTitle}:`,
      ...ranked.map((item) => `${item.gift.name[locale]}: ${item.score}/15`),
    ];
    await Clipboard.setStringAsync(lines.join("\n"));
    showAlert(i18n.t("copied"));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#176B55" />
      </View>
    );
  }

  if (loadFailed || !result) {
    return (
      <View style={[styles.center, { padding: 24 }]}>
        <Text style={styles.errorText}>{i18n.t("giftResultLoadFailed")}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadResult}>
          <Text style={styles.retryText}>{i18n.t("retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { width: contentWidth }]}>
        <Text style={styles.heading}>{i18n.t("yourLeadingGifts")}</Text>
        <View style={styles.topRow}>
          {visibleTop.map((item) => (
            <TouchableOpacity
              key={item.gift.id}
              style={styles.topCard}
              onPress={() => setSelectedGift(item.gift)}
            >
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{item.rank}</Text>
              </View>
              <Text style={styles.topName} numberOfLines={2} adjustsFontSizeToFit>
                {item.gift.name[locale]}
              </Text>
              <Text style={styles.topScore}>{item.score}/15</Text>
            </TouchableOpacity>
          ))}
        </View>

        {hiddenTop.length > 0 && (
          <TouchableOpacity style={styles.tieButton} onPress={() => setShowTies(true)}>
            <Text style={styles.tieButtonText}>
              {i18n.t("moreTiedGifts", { count: hiddenTop.length })}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#176B55" />
          </TouchableOpacity>
        )}

        <Text style={styles.allScoresTitle}>{i18n.t("allGiftScores")}</Text>
        <FlatList
          style={styles.scoreList}
          data={ranked}
          keyExtractor={(item) => item.gift.id}
          showsVerticalScrollIndicator
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.scoreRow} onPress={() => setSelectedGift(item.gift)}>
              <View style={styles.scoreLabelArea}>
                <Text style={styles.scoreName}>{item.gift.name[locale]}</Text>
                <View style={styles.scoreTrack}>
                  <View style={[styles.scoreFill, { width: `${(item.score / 15) * 100}%` }]} />
                </View>
              </View>
              <Text style={styles.scoreValue}>{item.score}/15</Text>
            </TouchableOpacity>
          )}
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={copyResult}>
            <Ionicons name="copy-outline" size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>{i18n.t("copyGiftResults")}</Text>
          </TouchableOpacity>
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.replace("GiftAssessment")}
            >
              <Text style={styles.secondaryText}>{i18n.t("retakeGiftAssessment")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("HomeTabs", { screen: "Home" })}
            >
              <Text style={styles.secondaryText}>{i18n.t("backToHome")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <GiftExplanationModal
        gift={selectedGift}
        language={locale}
        onClose={() => setSelectedGift(null)}
      />

      <Modal visible={showTies} transparent animationType="fade" onRequestClose={() => setShowTies(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTies(false)} />
          <View style={styles.tieDialog}>
            <View style={styles.tieHeader}>
              <Text style={styles.tieTitle}>{i18n.t("additionalTiedGifts")}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowTies(false)}>
                <Ionicons name="close" size={22} color="#344054" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={hiddenTop}
              keyExtractor={(item) => item.gift.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.tieRow}
                  onPress={() => {
                    setShowTies(false);
                    setTimeout(() => setSelectedGift(item.gift), 180);
                  }}
                >
                  <Text style={styles.tieName}>{item.gift.name[locale]}</Text>
                  <Text style={styles.tieScore}>{item.score}/15</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA", alignItems: "center" },
  center: { flex: 1, backgroundColor: "#F6F8FA", alignItems: "center", justifyContent: "center" },
  content: { flex: 1, paddingHorizontal: 2, paddingTop: 14, paddingBottom: 12 },
  heading: { color: "#17212B", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  topRow: { flexDirection: "row", gap: 8 },
  topCard: { flex: 1, minHeight: 106, backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#D9E5DF", alignItems: "center", justifyContent: "center", padding: 8 },
  rankBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E3B341", marginBottom: 5 },
  rankText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  topName: { color: "#24483C", fontSize: 13, lineHeight: 17, fontWeight: "800", textAlign: "center" },
  topScore: { color: "#667085", fontSize: 12, marginTop: 4, fontWeight: "700" },
  tieButton: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 5 },
  tieButtonText: { color: "#176B55", fontSize: 12, fontWeight: "700" },
  allScoresTitle: { color: "#344054", fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 6 },
  scoreList: { flex: 1, minHeight: 145, backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#E4E7EC" },
  scoreRow: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAECF0" },
  scoreLabelArea: { flex: 1, marginRight: 12 },
  scoreName: { color: "#344054", fontSize: 13, fontWeight: "700" },
  scoreTrack: { height: 3, backgroundColor: "#E4E7EC", borderRadius: 2, marginTop: 5, overflow: "hidden" },
  scoreFill: { height: "100%", backgroundColor: "#2A8068" },
  scoreValue: { width: 42, color: "#176B55", fontSize: 13, fontWeight: "800", textAlign: "right" },
  actions: { paddingTop: 10 },
  primaryButton: { minHeight: 46, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#176B55", borderRadius: 8 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  secondaryButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#C9D8D2", paddingHorizontal: 5 },
  secondaryText: { color: "#344054", fontSize: 13, fontWeight: "700", textAlign: "center" },
  errorText: { color: "#475467", fontSize: 15, textAlign: "center" },
  retryButton: { marginTop: 18, paddingVertical: 11, paddingHorizontal: 28, backgroundColor: "#176B55", borderRadius: 8 },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.48)", alignItems: "center", justifyContent: "center", padding: 20 },
  tieDialog: { width: "100%", maxWidth: 480, maxHeight: "65%", backgroundColor: "#FFFFFF", borderRadius: 8, padding: 16 },
  tieHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  tieTitle: { flex: 1, color: "#17212B", fontSize: 18, fontWeight: "800" },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  tieRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EAECF0" },
  tieName: { color: "#344054", fontSize: 14, fontWeight: "700" },
  tieScore: { color: "#176B55", fontSize: 14, fontWeight: "800" },
});
