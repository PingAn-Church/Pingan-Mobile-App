import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { makeStyles, useTheme } from "../../theme";
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
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
        <ActivityIndicator color={colors.accent} />
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
        <Ionicons name="help-circle-outline" size={72} color={colors.textMuted} />
        <Text style={styles.resultLabel}>{i18n.t("notAttemptedYet")}</Text>
        <Text style={[styles.muted, { textAlign: "center", marginTop: 8 }]}>
          {i18n.t("notTakenQuizYet")}
        </Text>
        <View style={{ height: theme.spacing.xl }} />
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
            <Ionicons name="hourglass-outline" size={56} color={colors.star} />
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
              color={results.isPassed ? colors.star : colors.danger}
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
          ? colors.star
          : q.isCorrect
          ? colors.success
          : colors.danger;
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
              <Ionicons name={verdictIcon as any} size={theme.sizes.icon.md} color={verdictColor} />
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

// The quiz score is a one-off display number, larger than any text size.
const SCORE_FONT_SIZE = 48;

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    center: { justifyContent: "center", alignItems: "center" },
    summary: { alignItems: "center", paddingVertical: t.spacing.md },
    resultScore: { color: lc.text, fontSize: SCORE_FONT_SIZE, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.md },
    resultLabel: { color: lc.text, fontSize: t.typography.fontSize.xl, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.xs },
    muted: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, marginTop: t.spacing.xs },
    qCard: { backgroundColor: lc.surface, borderRadius: t.radius.card, padding: t.spacing.base, marginTop: t.spacing.base },
    qHeader: { flexDirection: "row", alignItems: "flex-start", gap: t.spacing.md },
    qText: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.semibold, flex: 1 },
    fieldLabel: {
      color: lc.textMuted,
      fontSize: t.typography.fontSize.xs,
      fontWeight: t.typography.fontWeight.bold,
      textTransform: "uppercase",
      marginTop: t.spacing.md,
    },
    fieldValue: { color: lc.textSecondary, fontSize: t.typography.fontSize.md, marginTop: t.spacing.xs },
    points: { color: lc.text, fontSize: t.typography.fontSize.sm, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.md },
    pendingTag: { color: lc.star, fontSize: t.typography.fontSize.sm, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.md },
    feedbackBox: {
      backgroundColor: lc.surfaceAccent,
      borderRadius: t.radius.card,
      padding: t.spacing.md,
      marginTop: t.spacing.md,
      borderLeftWidth: 3,
      borderLeftColor: lc.accent,
    },
    feedbackLabel: { color: lc.accent, fontSize: t.typography.fontSize.xs, fontWeight: t.typography.fontWeight.bold, marginBottom: t.spacing.xs },
    feedbackText: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm },
    explanation: { color: lc.textMuted, fontSize: t.typography.fontSize.sm, fontStyle: "italic", marginTop: t.spacing.md },
    primaryBtn: {
      backgroundColor: lc.accent,
      borderRadius: t.radius.control,
      paddingVertical: t.spacing.base,
      alignItems: "center",
      marginTop: t.spacing.xl,
    },
    primaryBtnText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.bold, fontSize: t.typography.fontSize.md },
    ghostBtn: { paddingVertical: t.spacing.base, alignItems: "center", marginTop: t.spacing.sm },
    ghostBtnText: { color: lc.textSecondary, fontWeight: t.typography.fontWeight.semibold },
  };
});
