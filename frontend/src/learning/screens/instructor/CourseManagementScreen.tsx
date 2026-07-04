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
import { useInfiniteQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getAllCoursesAdmin } from "@/services/authoringService";

export default function CourseManagementScreen() {
  const navigation = useNavigation<any>();
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["learning", "admin", "courses"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getAllCoursesAdmin({ page: Number(pageParam), size: 20 }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const courses = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Course Management</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate("CourseEditor", { courseId: null })}
        >
          <Ionicons name="add" size={18} color={Colors.white} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load courses.</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>No courses yet. Tap “New” to create one.</Text>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.secondary} /> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate("CourseEditor", { courseId: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.categoryName} • {item.totalSections} modules • {item.totalVideos} videos
                </Text>
              </View>
              <View style={[styles.badge, item.isPublished ? styles.badgePublished : styles.badgeDraft]}>
                <Text style={styles.badgeText}>{item.isPublished ? "Published" : "Draft"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
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
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newBtnText: { color: Colors.white, fontWeight: "700" },
  list: { padding: 14, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.backgroundGray,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: "700" },
  rowMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgePublished: { backgroundColor: Colors.green },
  badgeDraft: { backgroundColor: Colors.gray500 },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: "700" },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
