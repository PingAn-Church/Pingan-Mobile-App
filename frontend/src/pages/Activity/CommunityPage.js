import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";

const CommunityPage = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      {/* Activity and Members Section */}
      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => navigation.navigate("MyActivity")}
      >
        <Text style={styles.optionText}>My Activity</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => navigation.navigate("AdminControl")}
      >
        <Text style={styles.optionText}>Members (Admin Control)</Text>
      </TouchableOpacity>

      {/* Grid of Links with Colored Corners */}
      <View style={styles.gridContainer}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("CourseReplays")}
        >
          <View
            style={[styles.coloredCorner, { backgroundColor: "#B2EBF2" }]}
          />
          <Text style={styles.cardText}>Course Replays</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("LearningMaterials")}
        >
          <View
            style={[styles.coloredCorner, { backgroundColor: "#E0F2F1" }]}
          />
          <Text style={styles.cardText}>Learning Materials</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("NewsArticles")}
        >
          <View
            style={[styles.coloredCorner, { backgroundColor: "#E8F5E9" }]}
          />
          <Text style={styles.cardText}>News Articles</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("CounsellingAppointments")}
        >
          <View
            style={[styles.coloredCorner, { backgroundColor: "#B2EBF2" }]}
          />
          <Text style={styles.cardText}>Counselling Appointments</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("FormApplications")}
        >
          <View
            style={[styles.coloredCorner, { backgroundColor: "#E0F7FA" }]}
          />
          <Text style={styles.cardText}>Form Applications</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  topSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF", // White background
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderColor: "#DDDDDD", // Light gray border
    borderWidth: 1,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Shadow for Android
    elevation: 2,
    marginBottom: 20,
  },
  optionText: {
    fontSize: 16,
    marginLeft: 10,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 25,
  },
  card: {
    width: "48%",
    padding: 25,
    marginBottom: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF", // White card background
    position: "relative",
    borderColor: "#DDDDDD",
    borderWidth: 1,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Shadow for Android
    elevation: 2,
  },
  cardText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  coloredCorner: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 20,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderColor: "#DDDDDD",
    borderWidth: 1,
  },
});

export default CommunityPage;
