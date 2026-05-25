import React, { useContext, useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";

const safeT = (key, fallback) => {
  const translated = i18n.t(key);
  if (typeof translated !== "string") return fallback;

  const normalized = translated.trim();
  const lower = normalized.toLowerCase();
  const isMissingTranslation =
    normalized === key || (lower.includes("missing") && lower.includes("translation"));

  return normalized && !isMissingTranslation ? normalized : fallback;
};

const SocialPage = () => {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { language } = useContext(LanguageContext);
  const { user } = useContext(UserContext);

  const isWide = width >= 880;

  const cards = useMemo(
    () => [
      {
        key: "chat",
        title: i18n.t("chat"),
        subtitle: safeT("socialChatSubtitle", "Private chats and group conversations"),
        icon: "chatbubble-ellipses-outline",
        route: "ChatHome",
        tint: "#007AFF",
        shell: "#EAF3FF",
      },
      {
        key: "threads",
        title: i18n.t("threads"),
        subtitle: safeT("socialThreadsSubtitle", "Long-form posts and async discussions"),
        icon: "document-text-outline",
        route: "ThreadHomePage",
        tint: "#0F766E",
        shell: "#E7F8F6",
      },
    ],
    [language]
  );

  if (!user || !user.verifiedUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.guardCard}>
          <View style={styles.guardIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={30} color="#1D4ED8" />
          </View>
          <Text style={styles.guardTitle}>{safeT("socialAccessLocked", "Access Restricted")}</Text>
          <Text style={styles.guardText}>{i18n.t("notVerified")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, isWide ? styles.heroCardWide : null]}>
          <Text style={styles.kicker}>{safeT("socialHub", "SOCIAL HUB")}</Text>
          <Text style={styles.heading}>{i18n.t("chooseSocialFeature")}</Text>
          <Text style={styles.subtitle}>
            {safeT(
              "socialHubSubtitle",
              "Jump into real-time chat or continue thoughtful discussions in threads."
            )}
          </Text>
        </View>

        <View style={[styles.cardsWrap, isWide ? styles.cardsWrapWide : null]}>
          {cards.map((card) => (
            <Pressable
              key={card.key}
              onPress={() => navigation.navigate(card.route)}
              style={({ pressed, hovered }) => [
                styles.featureCard,
                isWide ? styles.featureCardWide : null,
                hovered ? styles.featureCardHover : null,
                pressed ? styles.featureCardPressed : null,
              ]}
            >
              <View style={[styles.iconShell, { backgroundColor: card.shell }]}>
                <Ionicons name={card.icon} size={30} color={card.tint} />
              </View>

              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>{card.title}</Text>
                <Text style={styles.featureSubtitle}>{card.subtitle}</Text>
              </View>

              <View style={[styles.chevronWrap, { borderColor: `${card.tint}22` }]}>
                <Ionicons name="chevron-forward" size={18} color={card.tint} />
              </View>
            </Pressable>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 28,
    justifyContent: "center",
  },
  heroCard: {
    width: "100%",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroCardWide: {
    maxWidth: 980,
    alignSelf: "center",
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: "700",
    color: "#4B5563",
    marginBottom: 10,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
  },
  cardsWrap: {
    width: "100%",
    marginTop: 18,
  },
  cardsWrapWide: {
    maxWidth: 980,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    marginBottom: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  },
  featureCardWide: {
    width: "49%",
    marginBottom: 0,
  },
  featureCardHover: {
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.12,
  },
  featureCardPressed: {
    transform: [{ scale: 0.99 }],
    shadowOpacity: 0.06,
  },
  iconShell: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureCopy: {
    flex: 1,
    marginHorizontal: 14,
  },
  featureTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: "#111827",
  },
  featureSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  guardCard: {
    marginHorizontal: 24,
    marginTop: 140,
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  guardIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
  },
  guardTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  guardText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#64748B",
  },
});

export default SocialPage;
