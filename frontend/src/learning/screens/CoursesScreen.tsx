import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getCategories, getPublishedCourses } from "@/services/courseService";
import type { LearningCourse } from "@/types";

export function CourseCard({
  course,
  onPress,
  width,
}: {
  course: LearningCourse;
  onPress: () => void;
  width?: number;
}) {
  return (
    <TouchableOpacity style={[styles.card, width ? { width } : null]} onPress={onPress} activeOpacity={0.85}>
      <Image
        source={{ uri: course.thumbnailUrl || "https://picsum.photos/seed/course/400/250" }}
        style={styles.cardImage}
      />
      <View style={styles.cardBody}>
        <View style={[styles.categoryPill, { backgroundColor: course.categoryColor || Colors.secondary }]}>
          <Text style={styles.categoryPillText}>{course.categoryName}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {course.title}
        </Text>
        <Text style={styles.cardInstructor} numberOfLines={1}>
          {course.instructorName}
        </Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="star" size={14} color={Colors.starGold} />
          <Text style={styles.cardMetaText}>
            {course.rating ? course.rating.toFixed(1) : "New"}
          </Text>
          <Text style={styles.cardMetaDot}>•</Text>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.cardMetaText}>{course.durationHours}h</Text>
          <Text style={styles.cardMetaDot}>•</Text>
          <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.cardMetaText}>{course.studentCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<any>();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["learning", "categories"],
    queryFn: getCategories,
  });

  const coursesQuery = useQuery({
    queryKey: ["learning", "courses", activeCategory],
    queryFn: () =>
      getPublishedCourses(activeCategory ? { category: activeCategory } : {}),
  });

  const categories = categoriesQuery.data ?? [];
  const courses = coursesQuery.data?.courses ?? [];

  const chips = useMemo(
    () => [{ id: "all", name: "All" }, ...categories.map((c) => ({ id: c.name, name: c.name }))],
    [categories]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Courses</Text>

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
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : coursesQuery.isError ? (
        <Text style={styles.empty}>Could not load courses.</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>No courses available yet.</Text>
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
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.textPrimary,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  chipsRow: { maxHeight: 56 },
  chipsContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundGray,
    marginRight: 8,
  },
  chipActive: { backgroundColor: Colors.secondary },
  chipText: { color: Colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: Colors.white },
  list: { padding: 14, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  cardImage: { width: "100%", height: 150, backgroundColor: Colors.gray800 },
  cardBody: { padding: 12, gap: 4 },
  categoryPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 4,
  },
  categoryPillText: { color: Colors.white, fontSize: 11, fontWeight: "700" },
  cardTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: "700" },
  cardInstructor: { color: Colors.textSecondary, fontSize: 13 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  cardMetaText: { color: Colors.textSecondary, fontSize: 12 },
  cardMetaDot: { color: Colors.textMuted, marginHorizontal: 4 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
