import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants";
import { getWishlist } from "@/services/enrollmentService";
import { CourseCard } from "./CoursesScreen";
import i18n from "../../../i18n";

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
      <Text style={styles.heading}>{i18n.t("wishlist")}</Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.secondary} />
      ) : isError ? (
        <Text style={styles.empty}>{i18n.t("wishlistLoadFailed")}</Text>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>{i18n.t("wishlistEmpty")}</Text>
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
