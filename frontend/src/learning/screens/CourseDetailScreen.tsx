import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getCourseDetail } from "@/services/courseService";
import type { LearningLesson } from "@/types";

export default function CourseDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const courseId = String(route.params?.courseId ?? "");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["learning", "course", courseId],
    queryFn: () => getCourseDetail(courseId),
    enabled: !!courseId,
  });

  const openLesson = (lesson: LearningLesson) => {
    if (lesson.type === "video") {
      navigation.navigate("LearningVideo", {
        title: lesson.title,
        videoUrl: lesson.videoUrl,
      });
    } else {
      navigation.navigate("LearningDocument", {
        title: lesson.title,
        resourceUrl: lesson.resourceUrl,
        resourceType: lesson.resourceType,
      });
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Could not load this course.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Image
        source={{ uri: data.thumbnailUrl || "https://picsum.photos/seed/course/600/300" }}
        style={styles.hero}
      />
      <View style={styles.body}>
        <View style={[styles.categoryPill, { backgroundColor: data.categoryColor || Colors.secondary }]}>
          <Text style={styles.categoryPillText}>{data.categoryName}</Text>
        </View>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.instructor}>By {data.instructorName}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="star" size={16} color={Colors.starGold} />
          <Text style={styles.metaText}>
            {data.rating ? data.rating.toFixed(1) : "New"} ({data.totalRatings})
          </Text>
          <Text style={styles.dot}>•</Text>
          <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{data.durationHours}h</Text>
          <Text style={styles.dot}>•</Text>
          <Ionicons name="albums-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{data.modules.length} modules</Text>
        </View>

        {!!data.description && <Text style={styles.description}>{data.description}</Text>}

        {data.outcomes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What you'll learn</Text>
            {data.outcomes.map((o, i) => (
              <View key={i} style={styles.outcomeRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
                <Text style={styles.outcomeText}>{o}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Course content</Text>
          {data.modules.length === 0 ? (
            <Text style={styles.muted}>No content yet.</Text>
          ) : (
            data.modules.map((m, idx) => (
              <View key={m.id} style={styles.module}>
                <Text style={styles.moduleTitle}>
                  {idx + 1}. {m.title}
                </Text>
                {m.lessons.map((lesson) => (
                  <TouchableOpacity
                    key={lesson.id}
                    style={styles.lessonRow}
                    onPress={() => openLesson(lesson)}
                  >
                    <Ionicons
                      name={lesson.type === "video" ? "play-circle-outline" : "document-text-outline"}
                      size={20}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.lessonText} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                    {lesson.isPreview && <Text style={styles.previewTag}>Preview</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  center: { justifyContent: "center", alignItems: "center" },
  hero: { width: "100%", height: 200, backgroundColor: Colors.gray800 },
  body: { padding: 18, gap: 6 },
  categoryPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryPillText: { color: Colors.white, fontSize: 11, fontWeight: "700" },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 6 },
  instructor: { color: Colors.textSecondary, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  metaText: { color: Colors.textSecondary, fontSize: 13 },
  dot: { color: Colors.textMuted, marginHorizontal: 4 },
  description: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 12 },
  section: { marginTop: 22 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 10 },
  outcomeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  outcomeText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  module: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  moduleTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  lessonText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  previewTag: { color: Colors.starGold, fontSize: 11, fontWeight: "700" },
  muted: { color: Colors.textSecondary, fontSize: 14 },
});
