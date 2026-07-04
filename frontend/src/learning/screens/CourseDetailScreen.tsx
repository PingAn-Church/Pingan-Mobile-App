import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const reviewsQuery = useInfiniteQuery({
    queryKey: ["learning", "reviews", courseId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getCourseReviews(courseId, { page: Number(pageParam), size: 20 }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: !!courseId,
  });

  const data = detailQuery.data;
  const enrolled = enrolledQuery.data ?? false;
  const reviews = reviewsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  // Sync the heart from the server's wishlist status on load and after refetch,
  // so it stays filled when the screen is re-opened (not just within a session).
  useEffect(() => {
    if (detailQuery.data) setWishlisted(!!detailQuery.data.isInWishlist);
  }, [detailQuery.data]);

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
    const next = !wishlisted;
    setWishlisted(next); // optimistic; server truth re-syncs via the effect below
    try {
      if (next) await addToWishlist(courseId);
      else await removeFromWishlist(courseId);
      queryClient.invalidateQueries({ queryKey: ["learning", "course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["learning", "wishlist"] });
    } catch (e: any) {
      setWishlisted(!next); // revert on failure
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
        isCompleted: !!lesson.isCompleted,
        courseId,
      });
    } else if (lesson.type === "quiz") {
      // Already attempted → show results/feedback; otherwise start the attempt.
      if (lesson.quizAttempted) {
        navigation.navigate("QuizResults", { quizId: lesson.id, title: lesson.title });
      } else {
        navigation.navigate("QuizScreen", { quizId: lesson.id, title: lesson.title });
      }
    } else {
      navigation.navigate("LearningDocument", {
        title: lesson.title,
        resourceUrl: lesson.resourceUrl,
        resourceType: lesson.resourceType,
        resourceId: lesson.id,
        isCompleted: !!lesson.isCompleted,
        courseId,
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

  const renderHeader = () => (
    <>
      <View>
        <CourseCoverImage
          uri={data.thumbnailUrl}
          fallback="https://picsum.photos/seed/course/600/300"
          style={styles.hero}
        />
        <TouchableOpacity style={styles.heart} onPress={toggleWishlist}>
          <Ionicons name={wishlisted ? "heart" : "heart-outline"} size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

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
                    {enrolled && lesson.type !== "quiz" && lesson.isCompleted && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
                    )}
                    {enrolled && lesson.type === "quiz" &&
                      (lesson.quizAttempted ? (
                        lesson.gradesReleased ? (
                          <Text style={[styles.quizScore, { color: lesson.quizPassed ? Colors.green : Colors.starGold }]}>
                            {lesson.quizScore}%
                          </Text>
                        ) : (
                          <Text style={styles.quizPending}>Pending review</Text>
                        )
                      ) : (
                        <Text style={styles.quizNotAttempted}>Not attempted</Text>
                      ))}
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
          {reviewsQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.secondary} />
          ) : reviewsQuery.isError ? (
            <Text style={styles.muted}>Could not load reviews.</Text>
          ) : reviews.length === 0 ? (
            <Text style={styles.muted}>No reviews yet.</Text>
          ) : null}
        </View>
      </View>
    </>
  );

  const renderReview = ({ item: r }: { item: (typeof reviews)[number] }) => (
    <View style={[styles.review, styles.reviewListItem]}>
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
  );

  return (
    <FlatList
      style={styles.container}
      data={reviews}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader}
      renderItem={renderReview}
      contentContainerStyle={{ paddingBottom: 40 }}
      onEndReached={() => {
        if (reviewsQuery.hasNextPage && !reviewsQuery.isFetchingNextPage) {
          reviewsQuery.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        reviewsQuery.isFetchingNextPage ? (
          <ActivityIndicator style={{ marginVertical: 14 }} color={Colors.secondary} />
        ) : null
      }
    />
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
  quizScore: { fontSize: 13, fontWeight: "800" },
  quizPending: { color: Colors.starGold, fontSize: 11, fontWeight: "700" },
  quizNotAttempted: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  leaveReview: { color: Colors.secondary, fontWeight: "700" },
  review: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 12, marginBottom: 10 },
  reviewListItem: { marginHorizontal: 18 },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  reviewer: { color: Colors.textPrimary, fontWeight: "700" },
  reviewText: { color: Colors.textSecondary, fontSize: 14 },
  reply: { color: Colors.textMuted, fontSize: 13, marginTop: 6, fontStyle: "italic" },
  muted: { color: Colors.textSecondary, fontSize: 14 },
});
