import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getAchievements, type Achievement } from "@/services/achievementService";
import i18n from "../../../i18n";

export default function AchievementsScreen() {
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
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
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
  const iconName = (item.icon as keyof typeof Ionicons.glyphMap) || "trophy";
  return (
    <View style={[styles.card, !item.earned && styles.cardLocked]}>
      <View style={[styles.iconWrap, item.earned && styles.iconWrapEarned]}>
        <Ionicons
          name={item.earned ? iconName : "lock-closed"}
          size={24}
          color={item.earned ? Colors.starGold : Colors.textMuted}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, paddingHorizontal: 18, paddingTop: 18 },
  sub: { color: Colors.textSecondary, paddingHorizontal: 18, paddingTop: 4 },
  list: { padding: 14, paddingBottom: 40 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.backgroundGray,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardLocked: { opacity: 0.6 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapEarned: { backgroundColor: Colors.surface },
  title: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700" },
  desc: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  points: { color: Colors.textMuted, fontSize: 14, fontWeight: "800" },
  pointsEarned: { color: Colors.starGold },
});
