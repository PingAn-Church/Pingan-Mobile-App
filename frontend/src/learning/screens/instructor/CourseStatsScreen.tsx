import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getCourseStats, type CourseStatsRow } from "@/services/authoringService";

function StatBlock({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.statBlock}>
      <Ionicons name={icon} size={18} color={Colors.secondary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatsCard({ item }: { item: CourseStatsRow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={[styles.badge, item.isPublished ? styles.badgePublished : styles.badgeDraft]}>
          <Text style={styles.badgeText}>{item.isPublished ? "Published" : "Draft"}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatBlock icon="people-outline" value={String(item.enrolledCount)} label="Enrolled" />
        <StatBlock icon="checkmark-done-outline" value={String(item.completedCount)} label="Completed" />
        <StatBlock icon="flag-outline" value={`${item.completionRate}%`} label="Completion" />
      </View>

      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>Average progress</Text>
        <Text style={styles.progressPct}>{item.averageProgress}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, item.averageProgress))}%` }]} />
      </View>

      <View style={styles.ratingRow}>
        <Ionicons name="star" size={14} color={Colors.starGold} />
        <Text style={styles.ratingText}>
          {item.totalRatings > 0
            ? `${item.rating.toFixed(1)} (${item.totalRatings} rating${item.totalRatings === 1 ? "" : "s"})`
            : "No ratings yet"}
        </Text>
      </View>
    </View>
  );
}

export default function CourseStatsScreen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learning", "admin", "course-stats"],
    queryFn: getCourseStats,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const stats = data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Course Stats</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load course stats.</Text>
      ) : stats.length === 0 ? (
        <Text style={styles.empty}>No courses yet.</Text>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <StatsCard item={item} />}
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
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgePublished: { backgroundColor: Colors.green },
  badgeDraft: { backgroundColor: Colors.gray500 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: "700" },
  statRow: { flexDirection: "row", marginTop: 12 },
  statBlock: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: "800" },
  statLabel: { color: Colors.textSecondary, fontSize: 11 },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 4,
  },
  progressLabel: { color: Colors.textSecondary, fontSize: 12 },
  progressPct: { color: Colors.textPrimary, fontSize: 12, fontWeight: "700" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.gray800, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: Colors.secondary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 },
  ratingText: { color: Colors.textSecondary, fontSize: 12 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
