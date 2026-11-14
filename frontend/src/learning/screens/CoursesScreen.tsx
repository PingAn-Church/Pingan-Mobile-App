import React, { useContext, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import CourseCoverImage from "@/components/CourseCoverImage";
import { getCategories, getPublishedCourses } from "@/services/courseService";
import type { LearningCourse } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";

export function CourseCard({
  course,
  onPress,
  width,
}: {
  course: LearningCourse;
  onPress: () => void;
  width?: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  return (
    <TouchableOpacity style={[styles.card, width ? { width } : null]} onPress={onPress} activeOpacity={0.85}>
      <CourseCoverImage
        uri={course.thumbnailUrl}
        fallback="https://picsum.photos/seed/course/400/250"
        style={styles.cardImage}
      />
      <View style={styles.cardBody}>
        <View style={[styles.categoryPill, { backgroundColor: course.categoryColor || colors.accent }]}>
          <Text style={styles.categoryPillText}>{course.categoryName}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {course.title}
        </Text>
        <Text style={styles.cardInstructor} numberOfLines={1}>
          {course.instructorName}
        </Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="star" size={theme.sizes.icon.xs} color={colors.star} />
          <Text style={styles.cardMetaText}>
            {course.rating ? course.rating.toFixed(1) : i18n.t("courseNew")}
          </Text>
          <Text style={styles.cardMetaDot}>•</Text>
          <Ionicons name="time-outline" size={theme.sizes.icon.xs} color={colors.textSecondary} />
          <Text style={styles.cardMetaText}>{course.durationHours}h</Text>
          <Text style={styles.cardMetaDot}>•</Text>
          <Ionicons name="people-outline" size={theme.sizes.icon.xs} color={colors.textSecondary} />
          <Text style={styles.cardMetaText}>{course.studentCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const COURSES_PAGE_SIZE = 20;

export default function CoursesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuth();
  const { language } = useContext(LanguageContext);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["learning", "categories"],
    queryFn: getCategories,
  });

  const coursesQuery = useInfiniteQuery({
    queryKey: ["learning", "courses", activeCategory],
    queryFn: ({ pageParam }) =>
      getPublishedCourses({
        ...(activeCategory ? { category: activeCategory } : {}),
        offset: pageParam as number,
        limit: COURSES_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length * COURSES_PAGE_SIZE : undefined,
  });

  const categories = categoriesQuery.data ?? [];
  const courses = coursesQuery.data?.pages.flatMap((p) => p.courses) ?? [];

  const chips = useMemo(
    () => [{ id: "all", name: i18n.t("all") }, ...categories.map((c) => ({ id: c.name, name: c.name }))],
    [categories, language]
  );

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.heading}>{i18n.t("courses")}</Text>
        {isAuthenticated && <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate("MyCourses")}>
            <Ionicons name="school-outline" size={theme.sizes.icon.xs} color={colors.onAccent} />
            <Text style={styles.quickText}>{i18n.t("myLearning")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtnGhost} onPress={() => navigation.navigate("Wishlist")}>
            <Ionicons name="heart-outline" size={theme.sizes.icon.sm} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsContent}
      >
        {chips.map((chip) => {
          const value = chip.id === "all" ? null : chip.name;
          const active = activeCategory === value;
          return (
            <TouchableOpacity
              key={chip.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setActiveCategory(value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {coursesQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing["3xl"] }} color={colors.accent} />
      ) : coursesQuery.isError ? (
        <Text style={styles.empty}>{i18n.t("coursesLoadFailed")}</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>{i18n.t("noCoursesAvailable")}</Text>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CourseCard
              course={item}
              onPress={() =>
                navigation.navigate("LearningCourseDetail", { courseId: item.id })
              }
            />
          )}
          onEndReached={() => {
            if (coursesQuery.hasNextPage && !coursesQuery.isFetchingNextPage) {
              coursesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            coursesQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ marginVertical: theme.spacing.base }} color={colors.accent} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.base,
    },
    heading: {
      fontSize: t.typography.fontSize["2xl"],
      fontWeight: t.typography.fontWeight.bold,
      color: lc.text,
    },
    quickLinks: { flexDirection: "row", alignItems: "center", gap: t.spacing.sm },
    quickBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.spacing.xs,
      backgroundColor: lc.accent,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.full,
    },
    quickText: { color: lc.onAccent, fontWeight: t.typography.fontWeight.semibold, fontSize: t.typography.fontSize.xs },
    quickBtnGhost: {
      padding: t.spacing.sm,
      borderRadius: t.radius.full,
      backgroundColor: lc.surface,
    },
    chipsRow: { flexGrow: 0 }, // size to the chips instead of a fixed height
    chipsContent: { paddingHorizontal: t.spacing.base, paddingVertical: t.spacing.md, gap: t.spacing.sm },
    chip: {
      paddingHorizontal: t.spacing.base,
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.full,
      backgroundColor: lc.surface,
      marginRight: t.spacing.sm,
    },
    chipActive: { backgroundColor: lc.accent },
    chipText: { color: lc.textSecondary, fontWeight: t.typography.fontWeight.semibold },
    chipTextActive: { color: lc.onAccent },
    list: { padding: t.spacing.base, gap: t.spacing.base, paddingBottom: t.spacing["3xl"] },
    card: {
      backgroundColor: lc.surface,
      borderRadius: t.radius.card,
      overflow: "hidden",
      marginBottom: t.spacing.base,
    },
    cardImage: { width: "100%", height: 150, backgroundColor: lc.placeholder },
    cardBody: { padding: t.spacing.md, gap: t.spacing.xs },
    categoryPill: {
      alignSelf: "flex-start",
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radius.card,
      marginBottom: t.spacing.xs,
    },
    categoryPillText: { color: lc.onAccent, fontSize: t.typography.fontSize.xs, fontWeight: t.typography.fontWeight.bold },
    cardTitle: { color: lc.text, fontSize: t.typography.fontSize.lg, fontWeight: t.typography.fontWeight.bold },
    cardInstructor: { color: lc.textSecondary, fontSize: t.typography.fontSize.sm },
    cardMetaRow: { flexDirection: "row", alignItems: "center", gap: t.spacing.xs, marginTop: t.spacing.sm },
    cardMetaText: { color: lc.textSecondary, fontSize: t.typography.fontSize.xs },
    cardMetaDot: { color: lc.textMuted, marginHorizontal: t.spacing.xs },
    empty: { color: lc.textSecondary, textAlign: "center", marginTop: t.spacing["3xl"] },
  };
});
