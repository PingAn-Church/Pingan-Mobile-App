import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { makeStyles, useTheme } from "../../theme";
import { notify } from "@/utils/alerts";
import {
  getQuizDetail,
  submitQuiz,
  type QuizDetail,
  type QuizResult,
  type QuizQuestion,
} from "@/services/quizService";
import MatchingQuestion, { type MatchPair } from "./components/MatchingQuestion";
import i18n from "../../../i18n";

export default function QuizScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const quizId = String(route.params?.quizId ?? "");

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: route.params?.title || i18n.t("quiz") });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setQuiz(await getQuizDetail(quizId));
    } catch {
      notify(i18n.t("error"), i18n.t("quizLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const setSingle = (qid: string, value: string) =>
    setAnswers((a) => ({ ...a, [qid]: value }));

  const toggleMulti = (qid: string, value: string) =>
    setAnswers((a) => {
      const cur: string[] = Array.isArray(a[qid]) ? a[qid] : [];
      return {
        ...a,
        [qid]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      };
    });

  const setPairs = (qid: string, pairs: MatchPair[]) =>
    setAnswers((a) => ({ ...a, [qid]: pairs }));

  const handleSubmit = async () => {
    if (!quiz) return;
    const payload = quiz.questions.map((q) => ({
      questionId: q.id,
      answer:
        answers[q.id] ??
        (q.questionType === "multiple-correct" || q.questionType === "matching" ? [] : ""),
    }));
    setSubmitting(true);
    try {
      const r = await submitQuiz(quizId, payload);
      setResult(r);
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("quizSubmitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers({});
    load();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!quiz) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>{i18n.t("quizUnavailable")}</Text>
      </View>
    );
  }

  if (result?.pendingReview) {
    return (
      <View style={[styles.container, styles.center, { padding: 24 }]}>
        <Ionicons name="hourglass-outline" size={72} color={colors.star} />
        <Text style={styles.resultLabel}>{i18n.t("quizSubmittedForReview")}</Text>
        <Text style={[styles.muted, { textAlign: "center", marginTop: 8 }]}>
          {i18n.t("quizPendingReview", { count: result.pendingCount })}
        </Text>
        <View style={{ height: theme.spacing.xl }} />
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.replace("QuizResults", { quizId, title: quiz.title })}
        >
          <Text style={styles.primaryBtnText}>{i18n.t("viewDetailedFeedback")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.ghostBtnText}>{i18n.t("backToCourse")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (result) {
    const canRetry =
      !result.isPassed && (result.attemptsRemaining === null || result.attemptsRemaining > 0);
    return (
      <View style={[styles.container, styles.center, { padding: 24 }]}>
        <Ionicons
          name={result.isPassed ? "trophy" : "close-circle"}
          size={72}
          color={result.isPassed ? colors.star : colors.danger}
        />
        <Text style={styles.resultScore}>{result.score}%</Text>
        <Text style={styles.resultLabel}>
          {result.isPassed ? i18n.t("quizPassed") : i18n.t("quizKeepPractising")}
        </Text>
        <Text style={styles.muted}>
          {i18n.t("quizCorrectCount", { correct: result.correctAnswers, total: result.totalQuestions })}
          {result.attemptsRemaining !== null
            ? ` • ${i18n.t("attemptsLeft", { count: result.attemptsRemaining })}`
            : ""}
        </Text>
        <View style={{ height: theme.spacing.xl }} />
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.replace("QuizResults", { quizId, title: quiz.title })}
        >
          <Text style={styles.primaryBtnText}>{i18n.t("viewDetailedFeedback")}</Text>
        </TouchableOpacity>
        {canRetry && (
          <TouchableOpacity style={styles.ghostBtn} onPress={retry}>
            <Text style={styles.ghostBtnText}>{i18n.t("tryAgain")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.ghostBtnText}>{i18n.t("backToCourse")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    // Short-answer questions sit anywhere in the list, so a focused one is often
    // behind the keyboard. KeyboardAwareScrollView lifts whichever input has
    // focus; keyboardShouldPersistTaps lets the next option or Submit register on
    // the first tap instead of being eaten by the dismiss.
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 18, paddingBottom: 60 }}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{quiz.title}</Text>
      <Text style={styles.muted}>{i18n.t("passMark", { score: quiz.passingScore })}</Text>

      {quiz.questions.map((q, idx) => (
        <View key={q.id} style={styles.question}>
          <Text style={styles.questionText}>
            {idx + 1}. {q.question}
          </Text>
          {renderInput(q, answers[q.id], setSingle, toggleMulti, setPairs, styles, theme)}
        </View>
      ))}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.primaryBtnText}>{submitting ? i18n.t("submitting") : i18n.t("submitQuiz")}</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

function renderInput(
  q: QuizQuestion,
  value: any,
  setSingle: (qid: string, v: string) => void,
  toggleMulti: (qid: string, v: string) => void,
  setPairs: (qid: string, pairs: MatchPair[]) => void,
  styles: ReturnType<typeof useStyles>,
  theme: ReturnType<typeof useTheme>
) {
  const colors = theme.colors.learning;
  if (q.questionType === "matching") {
    return (
      <MatchingQuestion
        left={q.matchingLeft ?? []}
        right={q.matchingRight ?? []}
        value={Array.isArray(value) ? value : []}
        onChange={(pairs) => setPairs(q.id, pairs)}
      />
    );
  }

  if (q.questionType === "short-answer") {
    return (
      <TextInput
        style={styles.shortAnswer}
        value={typeof value === "string" ? value : ""}
        onChangeText={(v) => setSingle(q.id, v)}
        placeholder={i18n.t("typeYourAnswer")}
        placeholderTextColor={colors.textMuted}
      />
    );
  }

  const options =
    q.questionType === "true-false" && q.options.length === 0 ? ["True", "False"] : q.options;
  const multi = q.questionType === "multiple-correct";

  return (
    <View>
      {options.map((opt) => {
        const selected = multi
          ? Array.isArray(value) && value.includes(opt)
          : value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => (multi ? toggleMulti(q.id, opt) : setSingle(q.id, opt))}
          >
            <Ionicons
              name={
                multi
                  ? selected
                    ? "checkbox"
                    : "square-outline"
                  : selected
                  ? "radio-button-on"
                  : "radio-button-off"
              }
              size={theme.sizes.icon.md}
              color={selected ? colors.accent : colors.textMuted}
            />
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// The quiz score is a one-off display number, larger than any text size.
const SCORE_FONT_SIZE = 48;

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    center: { justifyContent: "center", alignItems: "center" },
    title: { color: lc.text, fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold },
    muted: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, marginTop: t.spacing.xs },
    question: { backgroundColor: lc.surface, borderRadius: t.radius.card, padding: t.spacing.base, marginTop: t.spacing.base },
    questionText: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.semibold, marginBottom: t.spacing.md },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.md,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.sm,
      borderRadius: t.radius.card,
    },
    optionSelected: { backgroundColor: lc.surfaceAccent },
    optionText: { color: lc.textSecondary, fontSize: t.typography.fontSize.md, flex: 1 },
    shortAnswer: {
      backgroundColor: lc.input,
      color: lc.text,
      borderRadius: t.radius.card,
      padding: t.spacing.md,
    },
    primaryBtn: {
      backgroundColor: lc.accent,
      borderRadius: t.radius.control,
      paddingVertical: t.spacing.base,
      alignItems: "center",
      marginTop: t.spacing.xl,
      minWidth: 200,
    },
    primaryBtnText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.bold, fontSize: t.typography.fontSize.md },
    ghostBtn: { paddingVertical: t.spacing.base, alignItems: "center", marginTop: t.spacing.sm },
    ghostBtnText: { color: lc.textSecondary, fontWeight: t.typography.fontWeight.semibold },
    resultScore: { color: lc.text, fontSize: SCORE_FONT_SIZE, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.base },
    resultLabel: { color: lc.text, fontSize: t.typography.fontSize.xl, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.xs },
  };
});
