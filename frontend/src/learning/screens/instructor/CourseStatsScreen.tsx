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
import { useInfiniteQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getCourseStats, type CourseStatsRow } from "@/services/authoringService";
import i18n from "../../../../i18n";

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
          <Text style={styles.badgeText}>{item.isPublished ? i18n.t("published") : i18n.t("draft")}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatBlock icon="people-outline" value={String(item.enrolledCount)} label={i18n.t("enrolled")} />
        <StatBlock icon="checkmark-done-outline" value={String(item.completedCount)} label={i18n.t("completed")} />
        <StatBlock icon="flag-outline" value={`${item.completionRate}%`} label={i18n.t("completion")} />
      </View>

      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{i18n.t("averageProgress")}</Text>
        <Text style={styles.progressPct}>{item.averageProgress}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, item.averageProgress))}%` }]} />
      </View>

      <View style={styles.ratingRow}>
        <Ionicons name="star" size={14} color={Colors.starGold} />
        <Text style={styles.ratingText}>
          {item.totalRatings > 0
            ? i18n.t("ratingWithCount", { rating: item.rating.toFixed(1), count: item.totalRatings })
            : i18n.t("noRatingsYet")}
        </Text>
      </View>
    </View>
  );
}

export default function CourseStatsScreen() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["learning", "admin", "course-stats"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getCourseStats({ page: Number(pageParam), size: 20 }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const stats = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>{i18n.t("courseStats")}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("statsLoadFailed")}</Text>
      ) : stats.length === 0 ? (
        <Text style={styles.empty}>{i18n.t("noCoursesYet")}</Text>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.secondary} /> : null
          }
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
