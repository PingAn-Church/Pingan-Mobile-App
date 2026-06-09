import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getInstructorUsers,
  getVerifiedUsers,
  updateUserInstructorStatus,
} from "../../service/UserService";
import { UserContext } from "../../context/UserContext";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";
import { useNavigation } from "@react-navigation/native";

export default function ManageInstructorsPage() {
  const { user } = useContext(UserContext);
  const [instructors, setInstructors] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  useEffect(() => {
    if (!user) return;
    navigation.setOptions({
      title: i18n.t("manageInstructors"),
      headerBackTitle: i18n.t("back"),
    });
    loadUsers();
  }, [language]);

  const loadUsers = async () => {
    try {
      const instructorList = await getInstructorUsers();
      const verifiedList = await getVerifiedUsers();

      // Candidates: verified users who are neither admins (implicitly instructors)
      // nor already explicit instructors.
      const candidateList = verifiedList.filter(
        (u) => u.id !== user.id && u.admin === false && u.instructor !== true
      );

      setInstructors(instructorList);
      setCandidates(candidateList);
    } catch (error) {
      console.error("Error fetching instructors:", error);
    }
  };

  const handleRemoveInstructor = async (userId) => {
    try {
      await updateUserInstructorStatus(userId, false);
      loadUsers();
    } catch (error) {
      console.error("Error removing instructor:", error);
      Alert.alert(i18n.t("error"), i18n.t("removeInstructorFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const handleAddInstructor = async (userId) => {
    try {
      await updateUserInstructorStatus(userId, true);
      loadUsers();
    } catch (error) {
      console.error("Error adding instructor:", error);
      Alert.alert(i18n.t("error"), i18n.t("addInstructorFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>{i18n.t("manageInstructors")}</Text>

      <Text style={styles.subHeader}>{i18n.t("currentInstructors")}</Text>
      {instructors.length > 0 ? (
        instructors.map((instructor) => (
          <View key={instructor.id} style={styles.userItem}>
            <Text style={styles.userName}>
              {instructor.firstName} {instructor.lastName}
            </Text>
            <TouchableOpacity
              onPress={() => handleRemoveInstructor(instructor.id)}
              style={styles.iconButton}
            >
              <Ionicons name="person-remove" size={24} color="red" />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noInstructors")}</Text>
      )}

      <Text style={styles.subHeader}>{i18n.t("verifiedUsers")}</Text>
      {candidates.length > 0 ? (
        candidates.map((candidate) => (
          <View key={candidate.id} style={styles.userItem}>
            <Text style={styles.userName}>
              {candidate.firstName} {candidate.lastName}
            </Text>
            <TouchableOpacity
              onPress={() => handleAddInstructor(candidate.id)}
              style={styles.iconButton}
            >
              <Ionicons name="person-add" size={24} color="green" />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.noData}>{i18n.t("noVerifiedUsers")}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subHeader: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 10,
    marginTop: 25,
  },
  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderRadius: 8,
    backgroundColor: "#fff",
    marginBottom: 8,
    elevation: 2,
  },
  userName: {
    fontSize: 18,
  },
  iconButton: {
    padding: 8,
    borderRadius: 5,
  },
  noData: {
    fontSize: 16,
    color: "gray",
    textAlign: "center",
    marginVertical: 10,
  },
});
