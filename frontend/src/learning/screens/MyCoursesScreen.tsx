import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import CourseCoverImage from "@/components/CourseCoverImage";
import { getMyCourses, type EnrolledCourse } from "@/services/enrollmentService";
import i18n from "../../../i18n";

const HUB_LINKS: { route: string; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { route: "Certificates", labelKey: "certificates", icon: "ribbon-outline" },
  { route: "Achievements", labelKey: "achievements", icon: "trophy-outline" },
  { route: "LearningGoal", labelKey: "goalsShort", icon: "flag-outline" },
];

function ProgressBar({ value }: { value: number }) {
  const styles = useStyles();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

export default function MyCoursesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
          {item.completedSections}/{item.totalSections} {i18n.t("modules")}
          {item.isCompleted ? ` • ${i18n.t("completed")}` : ""}
        </Text>
        <ProgressBar value={item.progressPercentage} />
        <Text style={styles.pct}>{Math.round(item.progressPercentage)}%</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{i18n.t("myLearning")}</Text>
      {stats && (
        <View style={styles.statsRow}>
          <Stat label={i18n.t("enrolled")} value={stats.totalEnrollments} />
          <Stat label={i18n.t("completed")} value={stats.completedCourses} />
          <Stat label={i18n.t("avgProgress")} value={`${Math.round(stats.averageProgress)}%`} />
        </View>
      )}

      <View style={styles.hubRow}>
        {HUB_LINKS.map((l) => (
          <TouchableOpacity key={l.route} style={styles.hubBtn} onPress={() => navigation.navigate(l.route)}>
            <Ionicons name={l.icon} size={theme.sizes.icon.md} color={colors.accent} />
            <Text style={styles.hubLabel}>{i18n.t(l.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing["3xl"] }} color={colors.accent} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("myCoursesLoadFailed")}</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>{i18n.t("noEnrolledCourses")}</Text>
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
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    heading: { fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, color: lc.text, padding: t.spacing.lg, paddingBottom: t.spacing.sm },
    statsRow: { flexDirection: "row", gap: t.spacing.md, paddingHorizontal: t.spacing.lg, marginBottom: t.spacing.sm },
    stat: { flex: 1, backgroundColor: lc.surface, borderRadius: t.radius.card, padding: t.spacing.md, alignItems: "center" },
    statValue: { color: lc.text, fontSize: t.typography.fontSize.lg, fontWeight: t.typography.fontWeight.bold },
    statLabel: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.xs },
    hubRow: { flexDirection: "row", gap: t.spacing.md, paddingHorizontal: t.spacing.lg, marginBottom: t.spacing.md },
    hubBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: t.spacing.sm,
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      paddingVertical: t.spacing.md,
    },
    hubLabel: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, fontWeight: t.typography.fontWeight.semibold },
    list: { padding: t.spacing.base, paddingBottom: t.spacing["3xl"] },
    card: { flexDirection: "row", backgroundColor: lc.surface, borderRadius: t.radius.card, overflow: "hidden", marginBottom: t.spacing.md },
    thumb: { width: 110, height: 110, backgroundColor: lc.placeholder },
    cardBody: { flex: 1, padding: t.spacing.md, justifyContent: "center" },
    cardTitle: { color: lc.text, fontSize: t.typography.fontSize.md, fontWeight: t.typography.fontWeight.bold },
    cardMeta: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginVertical: t.spacing.sm },
    track: { height: 6, borderRadius: t.radius.control, backgroundColor: lc.progressTrack, overflow: "hidden" },
    fill: { height: 6, backgroundColor: lc.progressFill },
    pct: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs, marginTop: t.spacing.xs },
    empty: { color: lc.textSecondary, textAlign: "center", marginTop: t.spacing["3xl"] },
  };
});
