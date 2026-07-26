import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants";
import {
  getPendingGrading,
  gradeShortAnswer,
  type PendingAttempt,
  type PendingQuestion,
} from "@/services/gradingService";
import { notify } from "@/utils/alerts";
import i18n from "../../../../i18n";

function QuestionGrader({
  attemptId,
  q,
  onGraded,
}: {
  attemptId: string;
  q: PendingQuestion;
  onGraded: () => void;
}) {
  const [points, setPoints] = useState(String(q.points));
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const awarded = Number(points);
    if (!Number.isFinite(awarded) || awarded < 0 || awarded > q.points) {
      notify(i18n.t("invalidPoints"), i18n.t("pointsRange", { max: q.points }));
      return;
    }
    setSaving(true);
    try {
      await gradeShortAnswer({
        attemptId,
        questionId: q.questionId,
        pointsAwarded: awarded,
        feedback: feedback.trim() || undefined,
      });
      onGraded();
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("gradeSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.questionBox}>
      <Text style={styles.questionText}>{q.question}</Text>
      <Text style={styles.answerLabel}>{i18n.t("studentAnswer")}</Text>
      <Text style={styles.studentAnswer}>{q.studentAnswer || i18n.t("noAnswer")}</Text>
      <Text style={styles.answerLabel}>{i18n.t("expectedAnswer")}</Text>
      <Text style={styles.expectedAnswer}>{q.expectedAnswer || "—"}</Text>

      <View style={styles.gradeRow}>
        <View style={styles.pointsWrap}>
          <Text style={styles.answerLabel}>{i18n.t("pointsMax", { max: q.points })}</Text>
          <TextInput
            style={styles.pointsInput}
            value={points}
            onChangeText={setPoints}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.answerLabel}>{i18n.t("feedbackOptional")}</Text>
          <TextInput
            style={styles.feedbackInput}
            value={feedback}
            onChangeText={setFeedback}
            placeholder={i18n.t("shownToLearner")}
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.gradeBtn} onPress={save} disabled={saving}>
        <Ionicons name="checkmark" size={16} color={Colors.white} />
        <Text style={styles.gradeBtnText}>{saving ? i18n.t("saving") : i18n.t("saveGrade")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function AttemptCard({ item, onGraded }: { item: PendingAttempt; onGraded: () => void }) {
  const submitted = item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "";
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.quizTitle}
      </Text>
      <Text style={styles.cardMeta}>
        {item.courseTitle} • {item.studentName} • {i18n.t("attemptN", { n: item.attemptNumber })}
        {submitted ? ` • ${submitted}` : ""}
      </Text>
      {item.questions.map((q) => (
        <QuestionGrader key={q.questionId} attemptId={item.attemptId} q={q} onGraded={onGraded} />
      ))}
    </View>
  );
}

export default function GradingScreen() {
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["learning", "grading", "pending"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getPendingGrading({ page: Number(pageParam), size: 20 }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const onGraded = () => {
    queryClient.invalidateQueries({ queryKey: ["learning", "grading", "pending"] });
  };

  const attempts = data?.pages.flatMap((page) => page.items) ?? [];

  // A page can filter down to zero cards server-side (e.g. every manual question
  // already graded but unreleased) while later pages still have work. An empty
  // list never triggers onEndReached, so keep fetching until something renders.
  useEffect(() => {
    if (!isLoading && !isFetchingNextPage && hasNextPage && attempts.length === 0) {
      fetchNextPage();
    }
  }, [isLoading, isFetchingNextPage, hasNextPage, attempts.length, fetchNextPage]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>{i18n.t("quizGrading")}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("gradingQueueLoadFailed")}</Text>
      ) : attempts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.empty}>{i18n.t("gradingAllCaughtUp")}</Text>
        </View>
      ) : (
        <FlatList
          data={attempts}
          keyExtractor={(item) => item.attemptId}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.secondary} /> : null
          }
          renderItem={({ item }) => <AttemptCard item={item} onGraded={onGraded} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  heading: { fontSize: 24, fontWeight: "800", color: Colors.textPrimary },
  list: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  questionBox: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  questionText: { color: Colors.textPrimary, fontSize: 14, fontWeight: "600" },
  answerLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 8, marginBottom: 2 },
  studentAnswer: { color: Colors.textPrimary, fontSize: 14 },
  expectedAnswer: { color: Colors.textSecondary, fontSize: 13, fontStyle: "italic" },
  gradeRow: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
  pointsWrap: { width: 110 },
  pointsInput: {
    backgroundColor: Colors.textInputBg,
    color: Colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  feedbackInput: {
    backgroundColor: Colors.textInputBg,
    color: Colors.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingVertical: 9,
    marginTop: 12,
  },
  gradeBtnText: { color: Colors.white, fontWeight: "700", fontSize: 13 },
  emptyWrap: { alignItems: "center", marginTop: 40, gap: 10, paddingHorizontal: 30 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 12 },
});
