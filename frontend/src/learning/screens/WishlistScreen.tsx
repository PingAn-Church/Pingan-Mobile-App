import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getWishlist } from "@/services/enrollmentService";
import { CourseCard } from "./CoursesScreen";

export default function WishlistScreen() {
  const navigation = useNavigation<any>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learning", "wishlist"],
    queryFn: getWishlist,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const courses = data ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Wishlist</Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>Could not load your wishlist.</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>Your wishlist is empty.</Text>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CourseCard
              course={item}
              onPress={() => navigation.navigate("LearningCourseDetail", { courseId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  heading: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, padding: 18 },
  list: { padding: 14, paddingBottom: 40 },
  empty: { color: Colors.textSecondary, textAlign: "center", marginTop: 40 },
});
