import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
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
        <ActivityIndicator color={Colors.secondary} />
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
        <Ionicons name="hourglass-outline" size={72} color={Colors.starGold} />
        <Text style={styles.resultLabel}>{i18n.t("quizSubmittedForReview")}</Text>
        <Text style={[styles.muted, { textAlign: "center", marginTop: 8 }]}>
          {i18n.t("quizPendingReview", { count: result.pendingCount })}
        </Text>
        <View style={{ height: 24 }} />
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
          color={result.isPassed ? Colors.starGold : Colors.red}
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
        <View style={{ height: 24 }} />
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
          {renderInput(q, answers[q.id], setSingle, toggleMulti, setPairs)}
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
  setPairs: (qid: string, pairs: MatchPair[]) => void
) {
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
        placeholderTextColor={Colors.textMuted}
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
              size={20}
              color={selected ? Colors.secondary : Colors.textMuted}
            />
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { justifyContent: "center", alignItems: "center" },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: "800" },
  muted: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  question: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 14, marginTop: 16 },
  questionText: { color: Colors.textPrimary, fontSize: 16, fontWeight: "600", marginBottom: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  optionSelected: { backgroundColor: Colors.surface },
  optionText: { color: Colors.textSecondary, fontSize: 15, flex: 1 },
  shortAnswer: {
    backgroundColor: Colors.textInputBg,
    color: Colors.textPrimary,
    borderRadius: 8,
    padding: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
    minWidth: 200,
  },
  primaryBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  ghostBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  ghostBtnText: { color: Colors.textSecondary, fontWeight: "600" },
  resultScore: { color: Colors.textPrimary, fontSize: 48, fontWeight: "900", marginTop: 16 },
  resultLabel: { color: Colors.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 4 },
});
