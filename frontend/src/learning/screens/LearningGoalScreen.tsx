import React, { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants";
import {
  getGoals,
  getGoalTemplates,
  createGoalsFromTemplates,
  clearGoal,
  metricLabel,
  type LearningGoal,
  type GoalTemplate,
} from "@/services/goalService";
import { confirmDestructive, notify } from "@/utils/alerts";

export default function LearningGoalScreen() {
  const queryClient = useQueryClient();
  const goalsQuery = useQuery({ queryKey: ["learning", "goals"], queryFn: getGoals });
  const templatesQuery = useQuery({ queryKey: ["learning", "goal-templates"], queryFn: getGoalTemplates });

  useFocusEffect(
    useCallback(() => {
      goalsQuery.refetch();
    }, [goalsQuery])
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["learning", "goals"] });
  };

  const adopt = async (t: GoalTemplate) => {
    try {
      await createGoalsFromTemplates([t.id]);
      refresh();
    } catch (e: any) {
      notify("Error", e?.message || "Could not add goal.");
    }
  };

  const remove = (g: LearningGoal) => {
    confirmDestructive("Remove goal", `Remove "${g.label}"?`, "Remove", async () => {
      try {
        await clearGoal(g.id);
        refresh();
      } catch (e: any) {
        notify("Error", e?.message || "Could not remove goal.");
      }
    });
  };

  const data = goalsQuery.data;
  const goals = (data?.goals ?? []).filter((g) => g.isActive);
  const adoptedIds = new Set((data?.goals ?? []).map((g) => g.id));
  const available = (templatesQuery.data ?? []).filter(
    (t) => !goals.some((g) => g.label === t.label)
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
      <Text style={styles.heading}>Learning Goals</Text>

      <View style={styles.streakRow}>
        <Ionicons name="flame" size={22} color={Colors.streakFire} />
        <Text style={styles.streakText}>
          {data?.currentStreak ?? 0}-day streak
        </Text>
        <Text style={styles.streakSub}>Best: {data?.longestStreak ?? 0}</Text>
      </View>

      {goalsQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={Colors.secondary} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Active goals</Text>
          {goals.length === 0 ? (
            <Text style={styles.muted}>No active goals. Add one below.</Text>
          ) : (
            goals.map((g) => <GoalCard key={g.id} goal={g} onRemove={() => remove(g)} />)
          )}

          <Text style={styles.sectionTitle}>Add a goal</Text>
          {available.length === 0 ? (
            <Text style={styles.muted}>You've adopted all available goals.</Text>
          ) : (
            available.map((t) => (
              <TouchableOpacity key={t.id} style={styles.templateRow} onPress={() => adopt(t)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateLabel}>{t.label}</Text>
                  <Text style={styles.templateMeta}>
                    {t.difficulty ? `${t.difficulty} • ` : ""}+{t.rewardPoints} pts
                  </Text>
                </View>
                <Ionicons name="add-circle" size={26} color={Colors.secondary} />
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function GoalCard({ goal, onRemove }: { goal: LearningGoal; onRemove: () => void }) {
  const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalLabel} numberOfLines={1}>
          {goal.label}
        </Text>
        {goal.isCompleted ? (
          <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
        ) : (
          <TouchableOpacity onPress={onRemove}>
            <Ionicons name="close" size={20} color={Colors.red} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.goalMeta}>
        {goal.currentValue}/{goal.targetValue} {metricLabel(goal.metric)} • +{goal.rewardPoints} pts
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  streakText: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700" },
  streakSub: { color: Colors.textSecondary, fontSize: 13, marginLeft: "auto" },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: "700", marginTop: 22, marginBottom: 10 },
  muted: { color: Colors.textSecondary },
  goalCard: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 14, marginBottom: 12 },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  goalLabel: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.progressTrack, overflow: "hidden" },
  fill: { height: 8, backgroundColor: Colors.progressFill },
  goalMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 8 },
  templateRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  templateLabel: { color: Colors.textPrimary, fontSize: 15, fontWeight: "600" },
  templateMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
});
