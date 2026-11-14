import React, { useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme } from "../../theme";
import { getWishlist } from "@/services/enrollmentService";
import { CourseCard } from "./CoursesScreen";
import i18n from "../../../i18n";

export default function WishlistScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const colors = theme.colors.learning;
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
        <ActivityIndicator style={{ marginTop: theme.spacing["3xl"] }} color={colors.accent} />
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

const useStyles = makeStyles((t) => {
  const lc = t.colors.learning;
  return {
    container: { flex: 1, backgroundColor: lc.background },
    heading: { fontSize: t.typography.fontSize["2xl"], fontWeight: t.typography.fontWeight.bold, color: lc.text, padding: t.spacing.lg },
    list: { padding: t.spacing.base, paddingBottom: t.spacing["3xl"] },
    empty: { color: lc.textSecondary, textAlign: "center", marginTop: t.spacing["3xl"] },
  };
});
