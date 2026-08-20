import React, { useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { UserContext } from "../../context/UserContext";
import { showAlert } from "../../utils/showAlert";
import { QUESTION_COUNT, type SupportedLanguage } from "./spiritualGiftData";
import { SPIRITUAL_GIFT_QUESTIONS } from "./spiritualGiftQuestions";
import {
  clearAssessmentProgress,
  loadAssessmentProgress,
  replaceGuestSpiritualGiftResult,
  replaceMySpiritualGiftResult,
  saveAssessmentProgress,
} from "./spiritualGiftService";

const OPTIONS = [
  { score: 3, label: { zh: "许多", en: "A lot" } },
  { score: 2, label: { zh: "有些", en: "Some" } },
  { score: 1, label: { zh: "很少", en: "Very little" } },
  { score: 0, label: { zh: "没有", en: "Not at all" } },
];

export default function GiftAssessmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useContext(UserContext);
  const { language } = useContext(LanguageContext);
  const locale: SupportedLanguage = language === "en" ? "en" : "zh";
  const { width } = useWindowDimensions();

  const [answers, setAnswers] = useState<Array<number | null>>(
    () => Array(QUESTION_COUNT).fill(null)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    navigation.setOptions({ title: i18n.t("giftAssessment") });
  }, [language, navigation]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const saved = await loadAssessmentProgress(user?.id);
      if (cancelled) return;
      setRestoring(false);
      if (!saved) return;

      // Resuming is applied before the prompt rather than inside it, so the
      // questionnaire is already usable no matter what happens to the alert —
      // and the default outcome is the one that keeps the work.
      setAnswers(saved.answers);
      setCurrentIndex(saved.currentIndex);

      const answered = saved.answers.filter((answer) => answer !== null).length;
      showAlert(
        i18n.t("resumeAssessmentTitle"),
        i18n.t("resumeAssessmentMessage", { answered, total: QUESTION_COUNT }),
        [
          {
            text: i18n.t("startOverAssessment"),
            style: "cancel",
            onPress: () => {
              clearAssessmentProgress(user?.id);
              setAnswers(Array(QUESTION_COUNT).fill(null));
              setCurrentIndex(0);
            },
          },
          { text: i18n.t("resumeAssessment") },
        ]
      );
    };

    restore();
    return () => {
      cancelled = true;
    };
    // The attempt to restore belongs to the mount, not to later renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateTo = (nextIndex: number, direction: 1 | -1) => {
    setTransitioning(true);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 110,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateX, {
        toValue: -direction * 18,
        duration: 110,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      setCurrentIndex(nextIndex);
      translateX.setValue(direction * 18);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 150,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(() => setTransitioning(false));
    });
  };

  const finish = async (completedAnswers: number[]) => {
    setSubmitting(true);
    try {
      const result = user
        ? await replaceMySpiritualGiftResult(completedAnswers)
        : await replaceGuestSpiritualGiftResult(completedAnswers);
      await clearAssessmentProgress(user?.id);
      navigation.replace("GiftResults", { result });
    } catch (error: any) {
      showAlert(
        i18n.t("error"),
        error?.response?.data?.message || error?.message || i18n.t("giftResultSaveFailed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectAnswer = async (score: number) => {
    if (transitioning || submitting || restoring) return;
    const nextAnswers = [...answers];
    nextAnswers[currentIndex] = score;
    setAnswers(nextAnswers);

    if (currentIndex === QUESTION_COUNT - 1) {
      await finish(nextAnswers as number[]);
      return;
    }

    const nextIndex = currentIndex + 1;
    // Not awaited: the write is small, and a slow disk must not stall the
    // transition to the next question.
    saveAssessmentProgress(user?.id, { answers: nextAnswers, currentIndex: nextIndex });
    animateTo(nextIndex, 1);
  };

  const goPrevious = () => {
    if (currentIndex === 0 || transitioning || submitting || restoring) return;
    const previousIndex = currentIndex - 1;
    saveAssessmentProgress(user?.id, { answers, currentIndex: previousIndex });
    animateTo(previousIndex, -1);
  };

  const progress = submitting ? 1 : currentIndex / QUESTION_COUNT;
  const question = SPIRITUAL_GIFT_QUESTIONS[currentIndex];
  const contentWidth = Math.min(width - 32, 720);

  if (restoring) {
    return (
      <View style={[styles.screen, styles.restoringScreen]}>
        <ActivityIndicator size="large" color="#176B55" />
        <Text style={styles.savingText}>{i18n.t("restoringGiftProgress")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.progressArea}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
      </View>

      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.questionPanel,
            { width: contentWidth, opacity, transform: [{ translateX }] },
          ]}
        >
          <Text style={styles.questionText}>{question.text[locale]}</Text>

          <View style={styles.optionsRow}>
            {OPTIONS.map((option) => {
              const selected = answers[currentIndex] === option.score;
              return (
                <TouchableOpacity
                  key={option.score}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => selectAnswer(option.score)}
                  disabled={transitioning || submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label[locale]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>

      {/* Bottom inset keeps Back/Next above the system navigation bar (edge-to-edge). */}
      <View style={[styles.footer, { width: contentWidth, paddingBottom: 14 + insets.bottom }]}>
        {currentIndex > 0 ? (
          <TouchableOpacity style={styles.previousButton} onPress={goPrevious} disabled={submitting}>
            <Ionicons name="chevron-back" size={19} color="#344054" />
            <Text style={styles.previousText}>{i18n.t("previousQuestion")}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {submitting && (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color="#176B55" />
            <Text style={styles.savingText}>{i18n.t("calculatingGiftResult")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F8FA" },
  restoringScreen: { alignItems: "center", justifyContent: "center", gap: 10 },
  progressArea: { paddingTop: 14, paddingHorizontal: 20, alignItems: "center" },
  progressTrack: { width: "100%", maxWidth: 720, height: 4, backgroundColor: "#DDE4E1", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#176B55", borderRadius: 2 },
  progressText: { color: "#667085", fontSize: 12, fontWeight: "700", marginTop: 6 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  questionPanel: { alignItems: "stretch" },
  questionText: { color: "#17212B", fontSize: 22, lineHeight: 32, fontWeight: "700", textAlign: "center", minHeight: 112, textAlignVertical: "center" },
  optionsRow: { flexDirection: "row", gap: 7, marginTop: 40 },
  option: { flex: 1, minHeight: 52, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: "#C9D8D2", backgroundColor: "#FFFFFF" },
  optionSelected: { borderColor: "#176B55", backgroundColor: "#E7F2EE" },
  optionText: { color: "#475467", fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "center" },
  optionTextSelected: { color: "#155B49" },
  footer: { minHeight: 72, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingBottom: 14 },
  previousButton: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingRight: 14 },
  previousText: { color: "#344054", fontSize: 14, fontWeight: "700" },
  savingRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  savingText: { color: "#667085", fontSize: 12 },
});
