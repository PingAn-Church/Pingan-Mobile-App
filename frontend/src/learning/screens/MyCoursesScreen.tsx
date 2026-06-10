import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import CourseCoverImage from "@/components/CourseCoverImage";
import { getMyCourses, type EnrolledCourse } from "@/services/enrollmentService";

const HUB_LINKS: { route: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: "Certificates", label: "Certificates", icon: "ribbon-outline" },
  { route: "Achievements", label: "Achievements", icon: "trophy-outline" },
  { route: "LearningGoal", label: "Goals", icon: "flag-outline" },
];

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

export default function MyCoursesScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learning", "my-courses"],
    queryFn: getMyCourses,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const courses = data?.courses ?? [];
  const stats = data?.stats;

  const renderItem = ({ item }: { item: EnrolledCourse }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("LearningCourseDetail", { courseId: item.id })}
    >
      <CourseCoverImage
        uri={item.thumbnailUrl}
        fallback="https://picsum.photos/seed/course/200/120"
        style={styles.thumb}
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>
          {item.completedSections}/{item.totalSections} modules
          {item.isCompleted ? " • Completed" : ""}
        </Text>
        <ProgressBar value={item.progressPercentage} />
        <Text style={styles.pct}>{Math.round(item.progressPercentage)}%</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Learning</Text>
      {stats && (
        <View style={styles.statsRow}>
          <Stat label="Enrolled" value={stats.totalEnrollments} />
          <Stat label="Completed" value={stats.completedCourses} />
          <Stat label="Avg progress" value={`${Math.round(stats.averageProgress)}%`} />
        </View>
      )}

      <View style={styles.hubRow}>
        {HUB_LINKS.map((l) => (
          <TouchableOpacity key={l.route} style={styles.hubBtn} onPress={() => navigation.navigate(l.route)}>
            <Ionicons name={l.icon} size={20} color={Colors.secondary} />
            <Text style={styles.hubLabel}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load your courses.</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>You haven't enrolled in any courses yet.</Text>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, padding: 18, paddingBottom: 8 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginBottom: 8 },
  stat: { flex: 1, backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 12, alignItems: "center" },
  statValue: { color: Colors.textPrimary, fontSize: 18, fontWeight: "800" },
  statLabel: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  hubRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  hubBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    paddingVertical: 12,
  },
  hubLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: "600" },
  list: { padding: 14, paddingBottom: 40 },
  card: { flexDirection: "row", backgroundColor: Colors.backgroundGray, borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  thumb: { width: 110, height: 110, backgroundColor: Colors.gray800 },
  cardBody: { flex: 1, padding: 12, justifyContent: "center" },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: Colors.textSecondary, fontSize: 12, marginVertical: 6 },
  track: { height: 6, borderRadius: 4, backgroundColor: Colors.progressTrack, overflow: "hidden" },
  fill: { height: 6, backgroundColor: Colors.progressFill },
  pct: { color: Colors.textSecondary, fontSize: 11, marginTop: 4 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
