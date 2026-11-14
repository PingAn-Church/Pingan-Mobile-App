import React, { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
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
import i18n from "../../../i18n";

export default function LearningGoalScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
      notify(i18n.t("error"), e?.message || i18n.t("couldNotAddGoal"));
    }
  };

  const remove = (g: LearningGoal) => {
    confirmDestructive(i18n.t("removeGoal"), i18n.t("removeGoalConfirm", { label: g.label }), i18n.t("remove"), async () => {
      try {
        await clearGoal(g.id);
        refresh();
      } catch (e: any) {
        notify(i18n.t("error"), e?.message || i18n.t("couldNotRemoveGoal"));
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
      <Text style={styles.heading}>{i18n.t("learningGoals")}</Text>

      <View style={styles.streakRow}>
        <Ionicons name="flame" size={theme.sizes.icon.lg} color={colors.streak} />
        <Text style={styles.streakText}>
          {i18n.t("dayStreak", { days: data?.currentStreak ?? 0 })}
        </Text>
        <Text style={styles.streakSub}>
          {i18n.t("bestStreak", { value: data?.longestStreak ?? 0 })}
        </Text>
      </View>

      {goalsQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing["2xl"] }} color={colors.accent} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>{i18n.t("activeGoals")}</Text>
          {goals.length === 0 ? (
            <Text style={styles.muted}>{i18n.t("noActiveGoals")}</Text>
          ) : (
            goals.map((g) => <GoalCard key={g.id} goal={g} onRemove={() => remove(g)} />)
          )}

          <Text style={styles.sectionTitle}>{i18n.t("addGoal")}</Text>
          {available.length === 0 ? (
            <Text style={styles.muted}>{i18n.t("allGoalsAdopted")}</Text>
          ) : (
            available.map((t) => (
              <TouchableOpacity key={t.id} style={styles.templateRow} onPress={() => adopt(t)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateLabel}>{t.label}</Text>
                  <Text style={styles.templateMeta}>
                    {t.difficulty ? `${t.difficulty} • ` : ""}+{t.rewardPoints} {i18n.t("pointsUnit")}
                  </Text>
                </View>
                <Ionicons name="add-circle" size={theme.sizes.icon.lg} color={colors.accent} />
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

function GoalCard({ goal, onRemove }: { goal: LearningGoal; onRemove: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalLabel} numberOfLines={1}>
          {goal.label}
        </Text>
        {goal.isCompleted ? (
          <Ionicons name="checkmark-circle" size={theme.sizes.icon.md} color={colors.success} />
        ) : (
          <TouchableOpacity onPress={onRemove}>
            <Ionicons name="close" size={theme.sizes.icon.md} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.goalMeta}>
        {goal.currentValue}/{goal.targetValue} {metricLabel(goal.metric)} • +{goal.rewardPoints} {i18n.t("pointsUnit")}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    heading: { fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, color: lc.text },
    streakRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.sm,
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      padding: t.spacing.base,
      marginTop: t.spacing.base,
    },
    streakText: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold },
    streakSub: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm, marginLeft: "auto" },
    sectionTitle: { color: lc.text, fontSize: t.typography.fontSize.lg, fontWeight: t.typography.fontWeight.bold, marginTop: t.spacing.xl, marginBottom: t.spacing.md },
    muted: { color: lc.textSecondary },
    goalCard: { backgroundColor: lc.surface, borderRadius: t.radius.card, padding: t.spacing.base, marginBottom: t.spacing.md },
    goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: t.spacing.md },
    goalLabel: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold, flex: 1 },
    track: { height: 8, borderRadius: t.radius.control, backgroundColor: lc.progressTrack, overflow: "hidden" },
    fill: { height: 8, backgroundColor: lc.progressFill },
    goalMeta: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.sm },
    templateRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      padding: t.spacing.base,
      marginBottom: t.spacing.md,
    },
    templateLabel: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.semibold },
    templateMeta: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.xs },
  };
});
