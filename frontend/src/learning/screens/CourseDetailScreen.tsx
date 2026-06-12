import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants";
import CourseCoverImage from "@/components/CourseCoverImage";
import { getCourseDetail } from "@/services/courseService";
import {
  isEnrolled as checkEnrolled,
  enroll as enrollCourse,
  addToWishlist,
  removeFromWishlist,
} from "@/services/enrollmentService";
import { getCourseReviews } from "@/services/reviewService";
import { notify } from "@/utils/alerts";
import type { LearningLesson } from "@/types";

export default function CourseDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const courseId = String(route.params?.courseId ?? "");

  const [enrolling, setEnrolling] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["learning", "course", courseId],
    queryFn: () => getCourseDetail(courseId),
    enabled: !!courseId,
  });
  const enrolledQuery = useQuery({
    queryKey: ["learning", "enrolled", courseId],
    queryFn: () => checkEnrolled(courseId),
    enabled: !!courseId,
  });
  const reviewsQuery = useQuery({
    queryKey: ["learning", "reviews", courseId],
    queryFn: () => getCourseReviews(courseId),
    enabled: !!courseId,
  });

  const data = detailQuery.data;
  const enrolled = enrolledQuery.data ?? false;
  const reviews = reviewsQuery.data ?? [];

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enrollCourse(courseId);
      await queryClient.invalidateQueries({ queryKey: ["learning", "enrolled", courseId] });
      await queryClient.invalidateQueries({ queryKey: ["learning", "my-courses"] });
      notify("Enrolled", "You're enrolled. Start learning!");
    } catch (e: any) {
      notify("Error", e?.message || "Could not enrol.");
    } finally {
      setEnrolling(false);
    }
  };

  const toggleWishlist = async () => {
    try {
      if (wishlisted) {
        await removeFromWishlist(courseId);
        setWishlisted(false);
      } else {
        await addToWishlist(courseId);
        setWishlisted(true);
      }
    } catch (e: any) {
      notify("Error", e?.message || "Could not update wishlist.");
    }
  };

  const openLesson = (lesson: LearningLesson) => {
    if (!enrolled && !lesson.isPreview) {
      notify("Enrol required", "Enrol in this course to access this lesson.");
      return;
    }
    if (lesson.type === "video") {
      navigation.navigate("LearningVideo", {
        title: lesson.title,
        videoUrl: lesson.videoUrl,
        videoId: lesson.id,
      });
    } else if (lesson.type === "quiz") {
      navigation.navigate("QuizScreen", { quizId: lesson.id, title: lesson.title });
    } else {
      navigation.navigate("LearningDocument", {
        title: lesson.title,
        resourceUrl: lesson.resourceUrl,
        resourceType: lesson.resourceType,
        resourceId: lesson.id,
      });
    }
  };

  const lessonIcon = (type: string) =>
    type === "video" ? "play-circle-outline" : type === "quiz" ? "help-circle-outline" : "document-text-outline";

  if (detailQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }
  if (detailQuery.isError || !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Could not load this course.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <CourseCoverImage
        uri={data.thumbnailUrl}
        fallback="https://picsum.photos/seed/course/600/300"
        style={styles.hero}
      />
      <TouchableOpacity style={styles.heart} onPress={toggleWishlist}>
        <Ionicons name={wishlisted ? "heart" : "heart-outline"} size={24} color={Colors.white} />
      </TouchableOpacity>

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

        {enrolled ? (
          <View style={styles.enrolledPill}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
            <Text style={styles.enrolledText}>You're enrolled</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.enrollBtn} onPress={handleEnroll} disabled={enrolling}>
            <Text style={styles.enrollBtnText}>{enrolling ? "Enrolling..." : "Enrol — Free"}</Text>
          </TouchableOpacity>
        )}

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
                  <TouchableOpacity key={`${lesson.type}-${lesson.id}`} style={styles.lessonRow} onPress={() => openLesson(lesson)}>
                    <Ionicons
                      name={lessonIcon(lesson.type) as any}
                      size={20}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.lessonText} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                    {lesson.isPreview && <Text style={styles.previewTag}>Preview</Text>}
                    {!enrolled && !lesson.isPreview && (
                      <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.reviewHeader}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {enrolled && (
              <TouchableOpacity onPress={() => navigation.navigate("LeaveReview", { courseId })}>
                <Text style={styles.leaveReview}>Leave a review</Text>
              </TouchableOpacity>
            )}
          </View>
          {reviews.length === 0 ? (
            <Text style={styles.muted}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.review}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewer}>{r.reviewerName}</Text>
                  <View style={{ flexDirection: "row" }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= r.rating ? "star" : "star-outline"}
                        size={13}
                        color={Colors.starGold}
                      />
                    ))}
                  </View>
                </View>
                <Text style={styles.reviewText}>{r.review}</Text>
                {!!r.instructorReply && (
                  <Text style={styles.reply}>Instructor: {r.instructorReply}</Text>
                )}
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
  heart: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    padding: 8,
  },
  body: { padding: 18, gap: 6 },
  categoryPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  categoryPillText: { color: Colors.white, fontSize: 11, fontWeight: "700" },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 6 },
  instructor: { color: Colors.textSecondary, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  metaText: { color: Colors.textSecondary, fontSize: 13 },
  dot: { color: Colors.textMuted, marginHorizontal: 4 },
  enrollBtn: { backgroundColor: Colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 14 },
  enrollBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  enrolledPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  enrolledText: { color: Colors.green, fontWeight: "700" },
  description: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 14 },
  section: { marginTop: 22 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 10 },
  outcomeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  outcomeText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  module: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 14, marginBottom: 12 },
  moduleTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  lessonText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  previewTag: { color: Colors.starGold, fontSize: 11, fontWeight: "700" },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leaveReview: { color: Colors.secondary, fontWeight: "700" },
  review: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 12, marginBottom: 10 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  reviewer: { color: Colors.textPrimary, fontWeight: "700" },
  reviewText: { color: Colors.textSecondary, fontSize: 14 },
  reply: { color: Colors.textMuted, fontSize: 13, marginTop: 6, fontStyle: "italic" },
  muted: { color: Colors.textSecondary, fontSize: 14 },
});
