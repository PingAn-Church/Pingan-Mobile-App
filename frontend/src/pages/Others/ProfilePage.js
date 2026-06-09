import React, {
  useEffect,
  useState,
  useContext,
  useTransition,
  useCallback,
} from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
  Alert,
  ScrollView,
  Image, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../../context/UserContext";
import { useNotification } from "../../context/NotificationContext";
import { getUserById } from "../../service/UserService";
import { getAllApplications } from "../../service/ApplicationService";
import { useNavigation } from "@react-navigation/native";
import { logoutUser } from "../../service/AuthService";
import { getPresignedDownloadUrl } from "../../service/OSSService";
import { changePassword } from "../../service/AuthService";
import { LanguageContext } from "../../context/LanguageContext";
import { useFocusEffect } from "@react-navigation/native";
import i18n from "../../../i18n";
import { showAlert } from "../../utils/showAlert";

export default function ProfilePage() {
  const { user, setUser, logout } = useContext(UserContext);
  const navigation = useNavigation();
  const [userDetails, setUserDetails] = useState([]);
  const [profileImage, setProfileImage] = useState(null);
  const { language, toggleLanguage } = useContext(LanguageContext);
  const { handleDeactivatePushToken } = useNotification();

  // useEffect(() => {
  //   if (!user) return;
  //   const fetchUserData = async () => {
  //     try {
  //       const data = await getUserById(user.id);
  //       let iconUrl = null;

  //       if (data.profileImage != null) {
  //         iconUrl = await fetchViewingPresignedUrl(
  //           data.profileImage,
  //           "profile"
  //         );
  //         console.log("profile url: ", iconUrl);
  //       }

  //       setProfileImage(iconUrl);

  //       setUserDetails([
  //         {
  //           key: "1",
  //           icon: "person-outline",
  //           label: "name",
  //           value: data.firstName + " " + data.lastName,
  //         },
  //         {
  //           key: "2",
  //           icon: "mail-outline",
  //           label: "email",
  //           value: data.email,
  //         },
  //       ]);
  //     } catch (error) {
  //       console.error("Error fetching user data:", error);
  //     }
  //   };
  //   fetchUserData();
  //   console.log("profile image: ", profileImage);
  // }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      const fetchUserData = async () => {
        try {
          const data = await getUserById(user.id);
          let iconUrl = null;

          if (data.profileImage) {
            iconUrl = await fetchViewingPresignedUrl(
              data.profileImage,
              "profile"
            );
            console.log("profile url: ", iconUrl);
          }

          setProfileImage(iconUrl);

          setUserDetails([
            {
              key: "1",
              icon: "person-outline",
              label: "name",
              value: data.firstName + " " + data.lastName,
            },
            {
              key: "2",
              icon: "mail-outline",
              label: "email",
              value: data.email,
            },
            {
              key: "3",
              icon: "cake",
              label: "birthday",
              value: data.birthday,
            },
          ]);
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      };

      fetchUserData();
    }, [user])
  );

  const fetchViewingPresignedUrl = async (imageUrl, type) => {
    try {
      const fileName = imageUrl.split("/").pop();
      const presignedUrl = await getPresignedDownloadUrl(fileName, type);
      return presignedUrl;
    } catch (error) {
      console.error(`Error getting presigned URL for ${type}:`, error);
      return null;
    }
  };

  const options = [
    {
      titleKey: "manageNews",
      screen: "ManageAnnouncements",
      icon: "campaign",
    },
    {
      titleKey: "applicationsInbox",
      screen: "ManageApplications",
      icon: "description",
    },
    {
      titleKey: "manageVideos",
      screen: "ManageVideos",
      icon: "videocam",
    },
    {
      titleKey: "manageEvents",
      screen: "ManageEvents",
      icon: "event",
    },
    { titleKey: "manageEventPics", screen: "ManagePictures", icon: "image" },
    {
      titleKey: "manageOthers",
      screen: "Others",
      icon: "menu",
    },
    {
      titleKey: "manageAdmins",
      screen: "ManageAdmins",
      icon: "admin-panel-settings",
    },
    {
      titleKey: "manageInstructors",
      screen: "ManageInstructors",
      icon: "school",
    },
    {
      titleKey: "manageUsers",
      screen: "ManageUsers",
      icon: "groups",
    },
  ];

  const instructorOptions = [
    {
      titleKey: "courseManagement",
      screen: "CourseManagement",
      icon: "library-books",
    },
  ];

  const handlePressLogout = async () => {
  try {
    await handleDeactivatePushToken();
    await logout();

    // Navigate first
    navigation.reset({
      index: 0,
      routes: [{ name: "Welcome" }],
    });

    // Fix URL for web
    if (Platform.OS === "web") {
      window.history.replaceState({}, "", "/");
    }

    // Then show success message
    showAlert(i18n.t("success"), i18n.t("logoutSuccess"));

  } catch (error) {
    console.error("Error logging out:", error);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          <View style={styles.profileCircle}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImage}
              />
            ) : (
              <Ionicons name="person-circle" size={100} color="#6e6e6e" />
            )}
          </View>
        </View>

        {user?.admin && (
          <View style={styles.adminContainer}>
            <Text style={styles.subHeader}>{i18n.t("adminControls")}</Text>
            <View style={{ flexShrink: 1 }}>
              <View style={styles.gridContainer}>
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.optionButton}
                    onPress={() => navigation.navigate(option.screen)}
                  >
                    <MaterialIcons name={option.icon} size={40} color="white" />
                    <Text style={styles.optionText}>
                      {i18n.t(option.titleKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {(user?.admin || user?.instructor) && (
          <View style={styles.adminContainer}>
            <Text style={styles.subHeader}>{i18n.t("instructorControls")}</Text>
            <View style={{ flexShrink: 1 }}>
              <View style={styles.gridContainer}>
                {instructorOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.optionButton}
                    onPress={() => navigation.navigate(option.screen)}
                  >
                    <MaterialIcons name={option.icon} size={40} color="white" />
                    <Text style={styles.optionText}>
                      {i18n.t(option.titleKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        <View style={styles.profileContainer}>
          <Text style={styles.subHeader}>{i18n.t("profile")}</Text>
          {userDetails.map((detail, index) => (
            <View key={index} style={styles.detailContainer}>
              <MaterialIcons
                name={detail.icon}
                size={24}
                color="#007AFF"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{i18n.t(detail.label)}</Text>
                <Text style={styles.detailValue}>{detail.value}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.detailContainer}
            onPress={() => navigation.navigate("ChangePassword")}
          >
            <MaterialIcons
              name="lock-outline"
              size={24}
              color="#007AFF"
              style={styles.detailIcon}
            />
            <View style={styles.detailTextContainer}>
              <Text style={styles.detailLabel}>{i18n.t("security")}</Text>
              <Text style={styles.detailValue}>{i18n.t("changePassword")}</Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={30}
              color="#aaa"
              style={{ marginLeft: 10 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailContainer}
            onPress={toggleLanguage}
          >
            <MaterialIcons
              name="language"
              size={24}
              color="#007AFF"
              style={styles.detailIcon}
            />
            <View style={styles.detailTextContainer}>
              <Text style={styles.detailLabel}>{i18n.t("changeLanguage")}</Text>
              <Text style={styles.detailValue}>
                {i18n.t("language")}:{" "}
                {i18n.t(language === "en" ? "english" : "chinese")}
              </Text>
            </View>
            <Ionicons
              name="repeat-outline"
              size={25}
              color="#aaa"
              style={{ marginRight: 5 }}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate("EditProfile")}
        >
          <Text style={styles.buttonText}>{i18n.t("editProfile")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handlePressLogout}
        >
          <Text style={styles.buttonText}>{i18n.t("logout")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ChangePasswordPage({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("changePassword"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (newPassword.length < 8) {
      showAlert(i18n.t("error"), i18n.t("passwordCheck"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      showAlert(i18n.t("error"), i18n.t("passwordMatch"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      showAlert(i18n.t("success"), i18n.t("updatePasswordSuccess"), [
        { text: i18n.t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("updatePasswordFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder={i18n.t("currentPassword")}
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        style={styles.passwordInputTop}
      />
      <TextInput
        placeholder={i18n.t("newPassword")}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.passwordInput}
      />
      <TextInput
        placeholder={i18n.t("confirmNewPassword")}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        style={styles.passwordInput}
      />

      <TouchableOpacity
        style={styles.changePasswordButton}
        onPress={handleChangePassword}
      >
        <Text style={styles.changePasswordText}>
          {i18n.t("updatePassword")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function ManageApplicationsPage({ navigation }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("applicationsInbox"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    const fetchApplications = async () => {
      const data = await getAllApplications();
      setApplications(data);
      setLoading(false);
    };

    fetchApplications();
  }, []);

  return (
    <View style={styles.container}>
      {loading ? (
        <Text>{i18n.t("loadingApplications")}</Text>
      ) : applications.length > 0 ? (
        <FlatList
          data={applications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.appCard}>
              <Text style={styles.detail}>
                {i18n.t("applicant")}
                {item.contact}
              </Text>
              <Text style={styles.detail}>
                {i18n.t("type")}
                {item.applicationType}
              </Text>
              <Text style={styles.detail}>
                {i18n.t("date")}
                {new Date(item.submittedAt).toLocaleDateString()}
              </Text>
              <Text style={styles.detail}>
                {i18n.t("remarks")} {item.remarks}
              </Text>
            </View>
          )}
        />
      ) : (
        <Text style={styles.noData}>{i18n.t("noApplications")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 15,
  },
  adminContainer: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 0,
    paddingBottom: 0,
    alignItems: "stretch",
  },
  profileContainer: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 25,
    marginTop: 0,
    paddingTop: 0,
  },
  subHeader: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 10,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  profileCircle: {
    backgroundColor: "#fff",
    alignItems: "center",
    borderRadius: 50,
    padding: 5,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  detailsContainer: {
    flexDirection: "column",
    gap: 10, // Adds spacing between each profile detail row
  },
  detailContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2, // Adds shadow for better depth
    marginBottom: 10,
  },
  detailIcon: {
    marginRight: 15,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 16,
    color: "#888",
  },
  detailValue: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignContent: "flex-start",
    alignSelf: "flex-start",
    marginTop: 10,
    marginBottom: 0,
    gap: 10,
  },
  optionButton: {
    width: "45%",
    flexBasis: "31%",
    aspectRatio: 1,
    backgroundColor: "#007bff",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  optionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 5,
    textAlign: "center",
    flexWrap: "wrap",
  },
  logoutButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
    marginHorizontal: 10,
  },
  editButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
    marginHorizontal: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  appCard: {
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    borderColor: "#ccc",
    borderWidth: 1,
  },
  detail: {
    fontSize: 16,
    marginBottom: 5,
    lineHeight: 24,
  },
  noData: {
    textAlign: "center",
    fontSize: 16,
    marginTop: 20,
    color: "gray",
  },
  passwordInput: {
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    marginTop: 10,
    borderRadius: 5,
  },
  passwordInputTop: {
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    marginTop: 30,
    borderRadius: 5,
  },
  changePasswordButton: {
    backgroundColor: "#007BFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 40,
    marginBottom: 20,
  },
  changePasswordText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
