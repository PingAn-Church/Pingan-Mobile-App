import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { notify } from "@/utils/alerts";
import i18n from "../../../i18n";
import {
  getQuizDetail,
  getQuizResults,
  type QuizDetail,
  type QuizResultDetail,
} from "@/services/quizService";

/** Render any stored answer shape (string, option list, or matching pairs). */
const formatAnswer = (v: any): string => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (typeof v[0] === "object" && v[0] !== null) {
      return v.map((p: any) => `${p.left ?? ""} → ${p.right ?? ""}`).join("\n");
    }
    return v.join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * Read-only view of the user's latest attempt: released score (or a pending
 * banner while the instructor finishes grading short answers) plus a per-question
 * breakdown with the instructor's feedback. Reached after submitting, from the
 * course content list for an already-attempted quiz, and from the "Quiz graded"
 * push notification.
 */
export default function QuizResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const quizId = String(route.params?.quizId ?? "");

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<QuizResultDetail | null>(null);
  const [detail, setDetail] = useState<QuizDetail | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: route.params?.title || i18n.t("quizResults") });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Detail gives us the title, pass mark and remaining attempts (for retake);
      // results gives the graded breakdown. Detail failure shouldn't block results.
      const [r, d] = await Promise.all([
        getQuizResults(quizId),
        getQuizDetail(quizId).catch(() => null),
      ]);
      setResults(r);
      setDetail(d);
      if (d?.title) navigation.setOptions({ title: d.title });
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("resultsLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const goAttempt = () => {
    navigation.replace("QuizScreen", {
      quizId,
      title: detail?.title || route.params?.title,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }

  if (!results) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{i18n.t("resultsUnavailable")}</Text>
      </View>
    );
  }

  if (!results.attempted) {
    return (
      <View style={[styles.container, styles.center, { padding: 24 }]}>
        <Ionicons name="help-circle-outline" size={72} color={Colors.textMuted} />
        <Text style={styles.resultLabel}>{i18n.t("notAttemptedYet")}</Text>
        <Text style={[styles.muted, { textAlign: "center", marginTop: 8 }]}>
          {i18n.t("notTakenQuizYet")}
        </Text>
        <View style={{ height: 24 }} />
        <TouchableOpacity style={styles.primaryBtn} onPress={goAttempt}>
          <Text style={styles.primaryBtnText}>{i18n.t("takeQuiz")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.ghostBtnText}>{i18n.t("backToCourse")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pending = !results.gradesReleased;
  const canRetry =
    !results.isPassed &&
    (!detail || detail.attemptsRemaining === null || (detail.attemptsRemaining ?? 0) > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      <View style={styles.summary}>
        {pending ? (
          <>
            <Ionicons name="hourglass-outline" size={56} color={Colors.starGold} />
            <Text style={styles.resultLabel}>{i18n.t("awaitingGrading")}</Text>
            <Text style={[styles.muted, { textAlign: "center", marginTop: 6 }]}>
              {i18n.t("resultsPendingText")}
            </Text>
          </>
        ) : (
          <>
            <Ionicons
              name={results.isPassed ? "trophy" : "close-circle"}
              size={56}
              color={results.isPassed ? Colors.starGold : Colors.red}
            />
            <Text style={styles.resultScore}>{results.score}%</Text>
            <Text style={styles.resultLabel}>
              {results.isPassed ? i18n.t("quizPassed") : i18n.t("quizKeepPractising")}
            </Text>
            <Text style={styles.muted}>
              {i18n.t("quizCorrectCount", { correct: results.correctAnswers, total: results.totalQuestions })}
              {detail?.passingScore != null
                ? ` • ${i18n.t("passMark", { score: detail.passingScore })}`
                : ""}
            </Text>
          </>
        )}
      </View>

      {results.questions.map((q, idx) => {
        const isPending = q.pendingReview || q.isCorrect == null;
        const verdictColor = isPending
          ? Colors.starGold
          : q.isCorrect
          ? Colors.green
          : Colors.red;
        const verdictIcon = isPending
          ? "hourglass-outline"
          : q.isCorrect
          ? "checkmark-circle"
          : "close-circle";
        const showCorrect =
          !isPending && !q.isCorrect && q.correctAnswer != null && q.correctAnswer !== "";
        return (
          <View key={q.id} style={styles.qCard}>
            <View style={styles.qHeader}>
              <Text style={styles.qText}>
                {idx + 1}. {q.question}
              </Text>
              <Ionicons name={verdictIcon as any} size={20} color={verdictColor} />
            </View>

            <Text style={styles.fieldLabel}>{i18n.t("yourAnswer")}</Text>
            <Text style={styles.fieldValue}>{formatAnswer(q.yourAnswer)}</Text>

            {q.pendingReview ? (
              <Text style={styles.pendingTag}>{i18n.t("pendingInstructorReview")}</Text>
            ) : (
              <>
                {showCorrect && (
                  <>
                    <Text style={styles.fieldLabel}>{i18n.t("correctAnswer")}</Text>
                    <Text style={styles.fieldValue}>{formatAnswer(q.correctAnswer)}</Text>
                  </>
                )}
                {q.maxPoints != null && (
                  <Text style={styles.points}>
                    {i18n.t("pointsAwarded", { awarded: q.pointsAwarded ?? 0, max: q.maxPoints })}
                  </Text>
                )}
              </>
            )}

            {!!q.feedback && (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackLabel}>{i18n.t("instructorFeedback")}</Text>
                <Text style={styles.feedbackText}>{q.feedback}</Text>
              </View>
            )}

            {!!q.explanation && <Text style={styles.explanation}>{q.explanation}</Text>}
          </View>
        );
      })}

      {canRetry && (
        <TouchableOpacity style={styles.primaryBtn} onPress={goAttempt}>
          <Text style={styles.primaryBtnText}>{i18n.t("retakeQuiz")}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.ghostBtnText}>{i18n.t("backToCourse")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { justifyContent: "center", alignItems: "center" },
  summary: { alignItems: "center", paddingVertical: 12 },
  resultScore: { color: Colors.textPrimary, fontSize: 48, fontWeight: "900", marginTop: 12 },
  resultLabel: { color: Colors.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 4 },
  muted: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  qCard: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 14, marginTop: 14 },
  qHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  qText: { color: Colors.textPrimary, fontSize: 16, fontWeight: "600", flex: 1 },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 10,
  },
  fieldValue: { color: Colors.textSecondary, fontSize: 15, marginTop: 2 },
  points: { color: Colors.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 10 },
  pendingTag: { color: Colors.starGold, fontSize: 13, fontWeight: "700", marginTop: 10 },
  feedbackBox: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.secondary,
  },
  feedbackLabel: { color: Colors.secondary, fontSize: 12, fontWeight: "700", marginBottom: 2 },
  feedbackText: { color: Colors.textSecondary, fontSize: 14 },
  explanation: { color: Colors.textMuted, fontSize: 13, fontStyle: "italic", marginTop: 10 },
  primaryBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  ghostBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  ghostBtnText: { color: Colors.textSecondary, fontWeight: "600" },
});
