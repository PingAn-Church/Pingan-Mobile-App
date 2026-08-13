import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";
import GiftExplanationModal from "./GiftExplanationModal";
import {
  SPIRITUAL_GIFTS,
  type SpiritualGiftDefinition,
  type SupportedLanguage,
} from "./spiritualGiftData";
import {
  getGuestSpiritualGiftResult,
  getMySpiritualGiftResult,
} from "./spiritualGiftService";

const chunk = <T,>(items: T[], size: number): T[][] => {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
};

export default function GiftDiscoveryScreen() {
  const navigation = useNavigation<any>();
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const locale: SupportedLanguage = language === "en" ? "en" : "zh";
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 600;
  const pageWidth = Math.min(width - 32, 760);
  const columns = wide ? 5 : 3;
  const pages = useMemo(() => (wide ? [SPIRITUAL_GIFTS] : chunk(SPIRITUAL_GIFTS, 9)), [wide]);

  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedGift, setSelectedGift] = useState<SpiritualGiftDefinition | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("giftDiscovery") });
  }, [language, navigation]);

  useEffect(() => {
    loadLatest();
    // A result is fetched exactly when this entry screen is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadLatest = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = user
        ? await getMySpiritualGiftResult()
        : await getGuestSpiritualGiftResult();
      if (result) {
        navigation.replace("GiftResults", { result });
        return;
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const confirmStartAssessment = () => {
    showAlert(
      i18n.t("giftAssessmentPrivacyTitle"),
      i18n.t("giftAssessmentPrivacyMessage"),
      [
        { text: i18n.t("cancel"), style: "cancel" },
        {
          text: i18n.t("startGiftAssessment"),
          onPress: () => navigation.navigate("GiftAssessment"),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#176B55" />
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View style={[styles.center, styles.errorContent]}>
        <Ionicons name="cloud-offline-outline" size={44} color="#667085" />
        <Text style={styles.errorText}>{i18n.t("giftResultLoadFailed")}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadLatest}>
          <Text style={styles.retryText}>{i18n.t("retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 12) + 10 },
      ]}
    >
      <View style={[styles.inner, { width: pageWidth }]}>
        <View style={styles.mainContent}>
          <Text style={styles.heading}>{i18n.t("discoverYourSpiritualGifts")}</Text>
          <Text style={styles.intro}>{i18n.t("giftDiscoveryIntro")}</Text>

          <ScrollView
            horizontal={!wide}
            pagingEnabled={!wide}
            scrollEnabled={!wide}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              if (!wide) setPageIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
            }}
          >
            {pages.map((page, pageNumber) => (
              <View
                key={pageNumber}
                style={[styles.grid, { width: pageWidth }]}
              >
                {page.map((gift) => {
                  const gapTotal = (columns - 1) * 8;
                  const tileWidth = (pageWidth - gapTotal) / columns;
                  return (
                    <TouchableOpacity
                      key={gift.id}
                      style={[styles.giftTile, { width: tileWidth }]}
                      onPress={() => setSelectedGift(gift)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.giftName} numberOfLines={3} adjustsFontSizeToFit>
                        {gift.name[locale]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {!wide && (
            <View style={styles.dots}>
              {pages.map((_, index) => (
                <View key={index} style={[styles.dot, index === pageIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={confirmStartAssessment}
          >
            <Text style={styles.startButtonText}>{i18n.t("startGiftAssessment")}</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.source}>{i18n.t("giftAssessmentSource")}</Text>
        </View>
      </View>

      <GiftExplanationModal
        gift={selectedGift}
        language={locale}
        onClose={() => setSelectedGift(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  content: { flexGrow: 1, alignItems: "center", paddingTop: 8, paddingHorizontal: 16 },
  inner: { flex: 1, alignSelf: "center" },
  mainContent: { flex: 1, justifyContent: "center", paddingVertical: 12 },
  footer: { paddingTop: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F8FA" },
  errorContent: { padding: 24 },
  errorText: { color: "#475467", fontSize: 15, textAlign: "center", marginTop: 12 },
  retryButton: { marginTop: 18, paddingVertical: 11, paddingHorizontal: 28, backgroundColor: "#176B55", borderRadius: 8 },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  heading: { color: "#17212B", fontSize: 24, fontWeight: "800", textAlign: "center" },
  intro: { color: "#667085", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignContent: "flex-start" },
  giftTile: {
    minHeight: 66,
    paddingHorizontal: 5,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9E5DF",
  },
  giftName: { color: "#24483C", fontSize: 12, lineHeight: 16, textAlign: "center", fontWeight: "700" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 7, marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#C9D2D0" },
  dotActive: { width: 18, backgroundColor: "#176B55" },
  startButton: {
    minHeight: 48,
    backgroundColor: "#176B55",
    borderRadius: 8,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  source: { color: "#98A2B3", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 14 },
});
