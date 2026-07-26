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
  ActivityIndicator,
  Image, Platform,
  useWindowDimensions
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../../context/UserContext";
import { useNotification } from "../../context/NotificationContext";
import { deleteOwnAccount, getUserById } from "../../service/UserService";
import { getAllApplications } from "../../service/ApplicationService";
import { useNavigation } from "@react-navigation/native";
import { logoutUser } from "../../service/AuthService";
import { getPresignedDownloadUrl } from "../../service/OSSService";
import { clearAll as clearMediaCache } from "../../service/MediaCacheService";
import { changePassword } from "../../service/AuthService";
import { LanguageContext } from "../../context/LanguageContext";
import { useFocusEffect } from "@react-navigation/native";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { showAlert } from "../../utils/showAlert";
import AppUpdateStatusIcon from "../../components/AppUpdateStatusIcon";
import TermsModal, { TERMS_COPY } from "../../components/TermsAndConditions";

export default function ProfilePage() {
  const { user, setUser, logout } = useContext(UserContext);
  const navigation = useNavigation();
  const [userDetails, setUserDetails] = useState([]);
  const [profileImage, setProfileImage] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const { language, toggleLanguage } = useContext(LanguageContext);
  const { handleDeactivatePushToken } = useNotification();
  const termsCopy = TERMS_COPY[language] || TERMS_COPY.en;

  // On tablets/iPad the percentage-sized grid buttons balloon and push the admin,
  // instructor, and profile sections far apart. On wide screens use fixed compact
  // buttons and tighter section spacing so the layout stays dense.
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <AppUpdateStatusIcon />,
    });
  }, [navigation, language]);

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
              value: formatName(data.firstName, data.lastName),
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
      titleKey: "manageReporting",
      screen: "ManageReporting",
      icon: "report",
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
    {
      titleKey: "courseStats",
      screen: "CourseStats",
      icon: "insights",
    },
    {
      titleKey: "quizGrading",
      screen: "QuizGrading",
      icon: "grading",
    },
  ];

  const handlePressLogout = async () => {
  try {
    await handleDeactivatePushToken();
    // Clear cached chat media so it doesn't linger on a shared device after logout.
    await clearMediaCache();
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

  const confirmDeleteOwnAccount = () => {
    if (deletingAccount) return;
    if (user?.admin) {
      showAlert(i18n.t("error"), i18n.t("deleteOwnAccountAdminBlocked"), [
        { text: i18n.t("ok") },
      ]);
      return;
    }
    showAlert(
      i18n.t("deleteOwnAccountTitle"),
      i18n.t("deleteOwnAccountMessage"),
      [
        { text: i18n.t("cancel"), style: "cancel" },
        {
          text: i18n.t("continue"),
          style: "destructive",
          onPress: confirmDeleteOwnAccountFinal,
        },
      ]
    );
  };

  const confirmDeleteOwnAccountFinal = () => {
    showAlert(
      i18n.t("deleteOwnAccountFinalTitle"),
      i18n.t("deleteOwnAccountFinalMessage"),
      [
        { text: i18n.t("cancel"), style: "cancel" },
        {
          text: i18n.t("deleteOwnAccount"),
          style: "destructive",
          onPress: doDeleteOwnAccount,
        },
      ]
    );
  };

  const doDeleteOwnAccount = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    let completed = false;
    try {
      try {
        await handleDeactivatePushToken();
      } catch (pushError) {
        console.warn("Failed to deactivate push token before account deletion:", pushError);
      }

      await deleteOwnAccount();
      await logout();

      navigation.reset({
        index: 0,
        routes: [{ name: "Welcome" }],
      });

      if (Platform.OS === "web") {
        window.history.replaceState({}, "", "/");
      }

      showAlert(i18n.t("success"), i18n.t("deleteOwnAccountSuccess"));
      completed = true;
    } catch (error) {
      console.error("Error deleting account:", error);
      const message =
        typeof error?.response?.data === "string"
          ? error.response.data
          : i18n.t("deleteOwnAccountFailed");
      showAlert(i18n.t("error"), message, [{ text: i18n.t("ok") }]);
    } finally {
      if (!completed) {
        setDeletingAccount(false);
      }
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.guestContent}>
          <View style={styles.profileHeader}>
            <View style={styles.profileCircle}>
              <Ionicons name="person-circle" size={100} color="#6e6e6e" />
            </View>
          </View>

          <View style={styles.profileContainer}>
            <TouchableOpacity style={styles.detailContainer} onPress={toggleLanguage}>
              <MaterialIcons
                name="language"
                size={24}
                color="#007AFF"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{i18n.t("changeLanguage")}</Text>
                <Text style={styles.detailValue}>
                  {i18n.t("language")}: {i18n.t(language === "en" ? "english" : "chinese")}
                </Text>
              </View>
              <Ionicons name="repeat-outline" size={25} color="#aaa" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.detailContainer}
              onPress={() => navigation.navigate("StorageSettings")}
            >
              <MaterialIcons
                name="storage"
                size={24}
                color="#007AFF"
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{i18n.t("storage")}</Text>
                <Text style={styles.detailValue}>{i18n.t("manageStorage")}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={30} color="#aaa" />
            </TouchableOpacity>
          </View>

          <View style={styles.guestPrompt}>
            <Text style={styles.guestPromptText}>{i18n.t("guestUnlockMessage")}</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.buttonText}>{i18n.t("loginToUnlock")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

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
          <View style={[styles.adminContainer, isWideScreen && styles.adminContainerWide]}>
            <Text style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>{i18n.t("adminControls")}</Text>
            <View style={{ flexShrink: 1 }}>
              <View style={[styles.gridContainer, isWideScreen && styles.gridContainerWide]}>
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.optionButton, isWideScreen && styles.optionButtonWide]}
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
          <View style={[styles.adminContainer, isWideScreen && styles.adminContainerWide]}>
            <Text style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>{i18n.t("instructorControls")}</Text>
            <View style={{ flexShrink: 1 }}>
              <View style={[styles.gridContainer, styles.instructorGrid, isWideScreen && styles.gridContainerWide]}>
                {instructorOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.optionButton, isWideScreen && styles.optionButtonWide]}
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
          <Text style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>{i18n.t("profile")}</Text>
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
          style={styles.editButton}
          onPress={() => navigation.navigate("StorageSettings")}
        >
          <Text style={styles.buttonText}>{i18n.t("storage")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handlePressLogout}
        >
          <Text style={styles.buttonText}>{i18n.t("logout")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.termsEntry}
          onPress={() => setTermsVisible(true)}
        >
          <Text style={styles.termsEntryText}>{termsCopy.linkText}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteAccountButton, deletingAccount && styles.disabledButton]}
          onPress={confirmDeleteOwnAccount}
          disabled={deletingAccount}
        >
          {deletingAccount ? (
            <ActivityIndicator color="#c0392b" />
          ) : (
            <Text style={styles.deleteAccountText}>
              {i18n.t("deleteOwnAccount")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </SafeAreaView>
  );
}

export function ChangePasswordPage({ navigation }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("changePassword"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  const handleChangePassword = async () => {
    if (submitting) return; // ignore repeat taps while a request is in flight
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

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      showAlert(i18n.t("success"), i18n.t("updatePasswordSuccess"), [
        { text: i18n.t("ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("updatePasswordFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setSubmitting(false);
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
        style={[styles.changePasswordButton, submitting && { opacity: 0.6 }]}
        onPress={handleChangePassword}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.changePasswordText}>
            {i18n.t("updatePassword")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export function ManageApplicationsPage({ navigation }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { language } = useContext(LanguageContext);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("applicationsInbox"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    const fetchApplications = async () => {
      const res = await getAllApplications(0, 20);
      setApplications(res?.data || []);
      setPage(0);
      setHasMore(Boolean(res?.pagination?.hasMore));
      setLoading(false);
    };

    fetchApplications();
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await getAllApplications(next, 20);
      setApplications((prev) => [...prev, ...(res?.data || [])]);
      setPage(next);
      setHasMore(Boolean(res?.pagination?.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <Text>{i18n.t("loadingApplications")}</Text>
      ) : applications.length > 0 ? (
        <FlatList
          data={applications}
          keyExtractor={(item) => item.id.toString()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color="#888" />
            ) : null
          }
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
  // Wide-screen (tablet/iPad) overrides: tighten the vertical rhythm so the admin,
  // instructor, and profile sections sit close together instead of spreading out.
  adminContainerWide: {
    paddingTop: 4,
  },
  subHeaderWide: {
    marginVertical: 4,
  },
  gridContainerWide: {
    marginTop: 6,
  },
  // Fixed compact squares instead of ~31% of a wide screen (which balloons to
  // ~240px buttons, only 3 per row); ~140px fits 5–6 per row and keeps rows short.
  optionButtonWide: {
    width: 140,
    flexBasis: 140,
    marginBottom: 8,
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
  // The instructor grid often has a single item; stretch it to the full row so
  // the button's percentage width resolves the same as the admin buttons
  // instead of collapsing around its content.
  instructorGrid: {
    alignSelf: "stretch",
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
  termsEntry: {
    alignItems: "center",
    paddingVertical: 6,
    marginTop: 4,
    marginHorizontal: 10,
  },
  termsEntryText: {
    color: "#007AFF",
    fontSize: 13,
    fontWeight: "600",
  },
  deleteAccountButton: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 28,
    marginHorizontal: 10,
  },
  deleteAccountText: {
    color: "#c0392b",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
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
  guestContent: {
    flexGrow: 1,
    paddingTop: 20,
  },
  guestPrompt: {
    marginTop: 4,
    paddingHorizontal: 10,
  },
  guestPromptText: {
    color: "#666",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginHorizontal: 12,
    marginBottom: 8,
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
