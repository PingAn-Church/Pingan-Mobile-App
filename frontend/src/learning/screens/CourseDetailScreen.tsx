import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
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
import { useAuth } from "@/context/AuthContext";
import { showLoginRequiredAlert } from "../../utils/authGate";
import { confirmAction } from "../../utils/confirmAction";
import { reportContent, REPORT_TYPE_COURSE_REVIEW } from "../../service/ReportService";
import { LanguageContext } from "../../context/LanguageContext";
import i18n from "../../../i18n";
import { subscribeModerationEvents } from "../../service/ModerationEventService";

export default function CourseDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  useContext(LanguageContext);
  const courseId = String(route.params?.courseId ?? "");

  const [enrolling, setEnrolling] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["learning", "course", courseId, isAuthenticated ? "user" : "guest"],
    queryFn: () => getCourseDetail(courseId),
    enabled: !!courseId,
  });
  const enrolledQuery = useQuery({
    queryKey: ["learning", "enrolled", courseId],
    queryFn: () => checkEnrolled(courseId),
    enabled: !!courseId && isAuthenticated,
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

  useEffect(
    () =>
      subscribeModerationEvents((event) => {
        if (event?.contentType !== "COURSE_REVIEW"
            || String(event.courseId) !== courseId) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["learning", "reviews", courseId] });
      }),
    [courseId, queryClient]
  );

  useFocusEffect(
    useCallback(() => {
      reviewsQuery.refetch();
    }, [courseId])
  );

  // Sync the heart from the server's wishlist status on load and after refetch,
  // so it stays filled when the screen is re-opened (not just within a session).
  useEffect(() => {
    if (detailQuery.data) setWishlisted(!!detailQuery.data.isInWishlist);
  }, [detailQuery.data]);

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      showLoginRequiredAlert(navigation);
      return;
    }
    setEnrolling(true);
    try {
      await enrollCourse(courseId);
      await queryClient.invalidateQueries({ queryKey: ["learning", "enrolled", courseId] });
      await queryClient.invalidateQueries({ queryKey: ["learning", "my-courses"] });
      notify(i18n.t("courseEnrolledTitle"), i18n.t("courseEnrolledMessage"));
    } catch (e: any) {
      notify(i18n.t("error"), e?.message || i18n.t("courseEnrollFailed"));
    } finally {
      setEnrolling(false);
    }
  };

  const toggleWishlist = async () => {
    if (!isAuthenticated) {
      showLoginRequiredAlert(navigation);
      return;
    }
    const next = !wishlisted;
    setWishlisted(next); // optimistic; server truth re-syncs via the effect below
    try {
      if (next) await addToWishlist(courseId);
      else await removeFromWishlist(courseId);
      queryClient.invalidateQueries({ queryKey: ["learning", "course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["learning", "wishlist"] });
    } catch (e: any) {
      setWishlisted(!next); // revert on failure
      notify(i18n.t("error"), e?.message || i18n.t("wishlistUpdateFailed"));
    }
  };

  const reportReview = async (reviewId: string) => {
    if (!isAuthenticated) {
      showLoginRequiredAlert(navigation);
      return;
    }
    const confirmed = await confirmAction({
      title: i18n.t("reportConfirmTitle"),
      message: i18n.t("reportConfirmMessage"),
      confirmText: i18n.t("report"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await reportContent(REPORT_TYPE_COURSE_REVIEW, reviewId);
      // Refetch so the review shadow-hides for the reporter right away.
      await queryClient.invalidateQueries({ queryKey: ["learning", "reviews", courseId] });
      notify(i18n.t("success"), i18n.t("reportSuccessMessage"));
    } catch (e: any) {
      if (e?.response?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ["learning", "reviews", courseId] });
        notify(i18n.t("error"), i18n.t("alreadyReported"));
      } else {
        notify(i18n.t("error"), i18n.t("reportFailed"));
      }
    }
  };

  const openLesson = (lesson: LearningLesson) => {
    if (!isAuthenticated && (!lesson.isPreview || lesson.type === "quiz")) {
      showLoginRequiredAlert(navigation);
      return;
    }
    if (!enrolled && !lesson.isPreview) {
      notify(i18n.t("enrolRequiredTitle"), i18n.t("enrolRequiredMessage"));
      return;
    }
    if (lesson.type === "video") {
      navigation.navigate("LearningVideo", {
        title: lesson.title,
        videoUrl: lesson.videoUrl,
        videoId: isAuthenticated ? lesson.id : null,
        isCompleted: !!lesson.isCompleted,
        courseId: isAuthenticated ? courseId : null,
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
        resourceId: isAuthenticated ? lesson.id : null,
        isCompleted: !!lesson.isCompleted,
        courseId: isAuthenticated ? courseId : null,
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
        <Text style={styles.muted}>{i18n.t("courseLoadFailed")}</Text>
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
        <Text style={styles.instructor}>{i18n.t("byInstructor")} {data.instructorName}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="star" size={16} color={Colors.starGold} />
          <Text style={styles.metaText}>
            {data.rating ? data.rating.toFixed(1) : i18n.t("courseNew")} ({data.totalRatings})
          </Text>
          <Text style={styles.dot}>•</Text>
          <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{data.durationHours}h</Text>
          <Text style={styles.dot}>•</Text>
          <Ionicons name="albums-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{data.modules.length} {i18n.t("modules")}</Text>
        </View>

        {enrolled ? (
          <View style={styles.enrolledPill}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
            <Text style={styles.enrolledText}>{i18n.t("youAreEnrolled")}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.enrollBtn} onPress={handleEnroll} disabled={enrolling}>
            <Text style={styles.enrollBtnText}>
              {enrolling ? i18n.t("enrolling") : i18n.t("enrolFree")}
            </Text>
          </TouchableOpacity>
        )}

        {!!data.description && <Text style={styles.description}>{data.description}</Text>}

        {data.outcomes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t("whatYouWillLearn")}</Text>
            {data.outcomes.map((o, i) => (
              <View key={i} style={styles.outcomeRow}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
                <Text style={styles.outcomeText}>{o}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{i18n.t("courseContent")}</Text>
          {data.modules.length === 0 ? (
            <Text style={styles.muted}>{i18n.t("noCourseContent")}</Text>
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
                    {lesson.isPreview && <Text style={styles.previewTag}>{i18n.t("preview")}</Text>}
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
                          <Text style={styles.quizPending}>{i18n.t("pendingReview")}</Text>
                        )
                      ) : (
                        <Text style={styles.quizNotAttempted}>{i18n.t("notAttempted")}</Text>
                      ))}
                    {!enrolled && (!lesson.isPreview || (!isAuthenticated && lesson.type === "quiz")) && (
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
            <Text style={styles.sectionTitle}>{i18n.t("reviews")}</Text>
            {(enrolled || !isAuthenticated) && (
              <TouchableOpacity
                onPress={() => isAuthenticated
                  ? navigation.navigate("LeaveReview", { courseId })
                  : showLoginRequiredAlert(navigation)}
              >
                <Text style={styles.leaveReview}>{i18n.t("leaveReview")}</Text>
              </TouchableOpacity>
            )}
          </View>
          {reviewsQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.secondary} />
          ) : reviewsQuery.isError ? (
            <Text style={styles.muted}>{i18n.t("reviewsLoadFailed")}</Text>
          ) : reviews.length === 0 ? (
            <Text style={styles.muted}>{i18n.t("noReviews")}</Text>
          ) : null}
        </View>
      </View>
    </>
  );

  const renderReview = ({ item: r }: { item: (typeof reviews)[number] }) => {
    // Reported reviews are shadow-hidden from everyone except their author
    // until an admin resolves the report.
    if (r.reported && !r.isOwn) {
      return (
        <View style={[styles.review, styles.reviewListItem]}>
          <Text style={styles.reportedPlaceholder}>{i18n.t("reportedPendingReview")}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.review, styles.reviewListItem]}>
        <View style={styles.reviewTop}>
          <Text style={styles.reviewer}>{r.reviewerName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= r.rating ? "star" : "star-outline"}
                size={13}
                color={Colors.starGold}
              />
            ))}
            {!r.isOwn && !r.reported && (
              <TouchableOpacity
                style={styles.reportReviewBtn}
                onPress={() => reportReview(r.id)}
                accessibilityLabel={i18n.t("report")}
              >
                <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={styles.reviewText}>{r.review}</Text>
        {!!r.instructorReply && (
          <Text style={styles.reply}>{i18n.t("instructorReply")}: {r.instructorReply}</Text>
        )}
      </View>
    );
  };

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
  reportReviewBtn: { marginLeft: 8, padding: 2 },
  reportedPlaceholder: { color: Colors.textMuted, fontSize: 14, fontStyle: "italic" },
  reply: { color: Colors.textMuted, fontSize: 13, marginTop: 6, fontStyle: "italic" },
  muted: { color: Colors.textSecondary, fontSize: 14 },
});
