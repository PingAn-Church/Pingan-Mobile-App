import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import { getAchievements, type Achievement } from "@/services/achievementService";
import i18n from "../../../i18n";

export default function AchievementsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learning", "achievements"],
    queryFn: getAchievements,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const achievements = data ?? [];
  const earnedCount = achievements.filter((a) => a.earned).length;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{i18n.t("achievements")}</Text>
      {!isLoading && !isError && achievements.length > 0 && (
        <Text style={styles.sub}>
          {i18n.t("achievementsUnlocked", { earned: earnedCount, total: achievements.length })}
        </Text>
      )}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing["3xl"] }} color={colors.accent} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("achievementsLoadFailed")}</Text>
      ) : achievements.length === 0 ? (
        <Text style={styles.empty}>{i18n.t("noAchievements")}</Text>
      ) : (
        <FlatList
          data={achievements}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <AchievementRow item={item} />}
        />
      )}
    </View>
  );
}

function AchievementRow({ item }: { item: Achievement }) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const iconName = (item.icon as keyof typeof Ionicons.glyphMap) || "trophy";
  return (
    <View style={[styles.card, !item.earned && styles.cardLocked]}>
      <View style={[styles.iconWrap, item.earned && styles.iconWrapEarned]}>
        <Ionicons
          name={item.earned ? iconName : "lock-closed"}
          size={theme.sizes.icon.lg}
          color={item.earned ? colors.star : colors.textMuted}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {item.description}
        </Text>
      </View>
      <Text style={[styles.points, item.earned && styles.pointsEarned]}>+{item.points}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    heading: { fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, color: lc.text, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg },
    sub: { color: lc.textSecondary, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xs },
    list: { padding: t.spacing.base, paddingBottom: t.spacing["3xl"] },
    empty: { color: lc.textSecondary, textAlign: "center", marginTop: t.spacing["3xl"] },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.base,
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      padding: t.spacing.base,
      marginBottom: t.spacing.md,
    },
    cardLocked: { opacity: 0.6 },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: t.radius.full,
      backgroundColor: lc.surfaceAccent,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrapEarned: { backgroundColor: lc.surfaceAccent },
    title: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold },
    desc: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.xs },
    points: { color: lc.textMuted, fontSize: t.typography.fontSize.sm, fontWeight: t.typography.fontWeight.bold },
    pointsEarned: { color: lc.star },
  };
});
