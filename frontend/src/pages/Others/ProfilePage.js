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
  Platform,
  useWindowDimensions
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { UserContext } from "../../context/UserContext";
import { useNotification } from "../../context/NotificationContext";
import { useAdminAlerts } from "../../context/AdminAlertContext";
import { deleteOwnAccount, getUserById } from "../../service/UserService";
import { getAllApplications } from "../../service/ApplicationService";
import { useNavigation } from "@react-navigation/native";
import { logoutUser } from "../../service/AuthService";
import { clearAll as clearMediaCache } from "../../service/MediaCacheService";
import { changePassword } from "../../service/AuthService";
import { LanguageContext } from "../../context/LanguageContext";
import { useFocusEffect } from "@react-navigation/native";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { showAlert } from "../../utils/showAlert";
import AppUpdateStatusIcon from "../../components/AppUpdateStatusIcon";
import TermsModal, { TERMS_COPY } from "../../components/TermsAndConditions";
import { parseServerDate } from "../../utils/serverDate";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Avatar, Button, Heading, PasswordField } from "../../components/ui";

export default function ProfilePage() {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const { user, setUser, logout } = useContext(UserContext);
  const navigation = useNavigation();
  const [userDetails, setUserDetails] = useState([]);
  const [profileImage, setProfileImage] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const { language, toggleLanguage } = useContext(LanguageContext);
  const { handleDeactivatePushToken } = useNotification();
  const { newMemberCount } = useAdminAlerts();
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

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      const fetchUserData = async () => {
        try {
          const data = await getUserById(user.id);
          // Kept as the stored object path rather than a signed URL: this screen
          // reloads on every focus, and a fresh signature each time would make the
          // same avatar look like a new picture and be downloaded again.
          setProfileImage(data.profileImage || null);

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
      // Sign-ups waiting to be verified. The Settings tab badge says something
      // is waiting; this says which of the nine tiles to open.
      badge: newMemberCount,
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

  // Read out by screen readers for the language row (guest and signed-in).
  const languageLabel = `${i18n.t("changeLanguage")}, ${i18n.t("language")}: ${i18n.t(
    language === "en" ? "english" : "chinese"
  )}`;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.guestContent}>
          <View style={styles.profileHeader}>
            <Avatar size="2xl" style={styles.profileImage} />
          </View>

          <View style={styles.profileContainer}>
            <TouchableOpacity
              style={styles.detailContainer}
              onPress={toggleLanguage}
              accessibilityRole="button"
              accessibilityLabel={languageLabel}
            >
              <MaterialIcons
                name="language"
                size={sizes.icon.lg}
                color={colors.primary}
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <AppText variant="secondary" size="md">{i18n.t("changeLanguage")}</AppText>
                <AppText variant="bodyLarge" weight="bold" color="textPrimary">
                  {i18n.t("language")}: {i18n.t(language === "en" ? "english" : "chinese")}
                </AppText>
              </View>
              <Ionicons name="repeat-outline" size={sizes.icon.lg} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.detailContainer}
              onPress={() => navigation.navigate("StorageSettings")}
              accessibilityRole="button"
              accessibilityLabel={`${i18n.t("storage")}, ${i18n.t("manageStorage")}`}
            >
              <MaterialIcons
                name="storage"
                size={sizes.icon.lg}
                color={colors.primary}
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <AppText variant="secondary" size="md">{i18n.t("storage")}</AppText>
                <AppText variant="bodyLarge" weight="bold" color="textPrimary">
                  {i18n.t("manageStorage")}
                </AppText>
              </View>
              <MaterialIcons name="chevron-right" size={sizes.icon.xl} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.guestPrompt}>
            <AppText variant="secondary" size="md" style={styles.guestPromptText}>
              {i18n.t("guestUnlockMessage")}
            </AppText>
            <Button
              title={i18n.t("loginToUnlock")}
              onPress={() => navigation.navigate("Login")}
              style={styles.editButton}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileHeader}>
          <Avatar uri={profileImage} size="2xl" style={styles.profileImage} />
        </View>

        {user?.admin && (
          <View style={[styles.adminContainer, isWideScreen && styles.adminContainerWide]}>
            <Heading style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>
              {i18n.t("adminControls")}
            </Heading>
            <View style={styles.gridWrapper}>
              <View style={[styles.gridContainer, isWideScreen && styles.gridContainerWide]}>
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.optionButton, isWideScreen && styles.optionButtonWide]}
                    onPress={() => navigation.navigate(option.screen)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      option.badge > 0
                        ? `${i18n.t(option.titleKey)}, ${option.badge > 99 ? "99+" : option.badge}`
                        : i18n.t(option.titleKey)
                    }
                  >
                    <MaterialIcons name={option.icon} size={sizes.icon["2xl"]} color={colors.onPrimary} />
                    <AppText variant="button" size="md" style={styles.optionText}>
                      {i18n.t(option.titleKey)}
                    </AppText>
                    {option.badge > 0 && (
                      <View style={styles.optionBadge}>
                        <AppText variant="badge">
                          {option.badge > 99 ? "99+" : option.badge}
                        </AppText>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {(user?.admin || user?.instructor) && (
          <View style={[styles.adminContainer, isWideScreen && styles.adminContainerWide]}>
            <Heading style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>
              {i18n.t("instructorControls")}
            </Heading>
            <View style={styles.gridWrapper}>
              <View style={[styles.gridContainer, styles.instructorGrid, isWideScreen && styles.gridContainerWide]}>
                {instructorOptions.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.optionButton, isWideScreen && styles.optionButtonWide]}
                    onPress={() => navigation.navigate(option.screen)}
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t(option.titleKey)}
                  >
                    <MaterialIcons name={option.icon} size={sizes.icon["2xl"]} color={colors.onPrimary} />
                    <AppText variant="button" size="md" style={styles.optionText}>
                      {i18n.t(option.titleKey)}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        <View style={styles.profileContainer}>
          <Heading style={[styles.subHeader, isWideScreen && styles.subHeaderWide]}>
            {i18n.t("profile")}
          </Heading>
          {userDetails.map((detail, index) => (
            <View
              key={index}
              style={styles.detailContainer}
              accessible
              accessibilityLabel={`${i18n.t(detail.label)}, ${detail.value}`}
            >
              <MaterialIcons
                name={detail.icon}
                size={sizes.icon.lg}
                color={colors.primary}
                style={styles.detailIcon}
              />
              <View style={styles.detailTextContainer}>
                <AppText variant="secondary" size="md">{i18n.t(detail.label)}</AppText>
                <AppText variant="bodyLarge" weight="bold" color="textPrimary">{detail.value}</AppText>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.detailContainer}
            onPress={() => navigation.navigate("ChangePassword")}
            accessibilityRole="button"
            accessibilityLabel={`${i18n.t("security")}, ${i18n.t("changePassword")}`}
          >
            <MaterialIcons
              name="lock-outline"
              size={sizes.icon.lg}
              color={colors.primary}
              style={styles.detailIcon}
            />
            <View style={styles.detailTextContainer}>
              <AppText variant="secondary" size="md">{i18n.t("security")}</AppText>
              <AppText variant="bodyLarge" weight="bold" color="textPrimary">{i18n.t("changePassword")}</AppText>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={sizes.icon.xl}
              color={colors.textSecondary}
              style={styles.chevron}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.detailContainer}
            onPress={toggleLanguage}
            accessibilityRole="button"
            accessibilityLabel={languageLabel}
          >
            <MaterialIcons
              name="language"
              size={sizes.icon.lg}
              color={colors.primary}
              style={styles.detailIcon}
            />
            <View style={styles.detailTextContainer}>
              <AppText variant="secondary" size="md">{i18n.t("changeLanguage")}</AppText>
              <AppText variant="bodyLarge" weight="bold" color="textPrimary">
                {i18n.t("language")}:{" "}
                {i18n.t(language === "en" ? "english" : "chinese")}
              </AppText>
            </View>
            <Ionicons
              name="repeat-outline"
              size={sizes.icon.lg}
              color={colors.textSecondary}
              style={styles.repeatIcon}
            />
          </TouchableOpacity>
        </View>

        <Button
          title={i18n.t("editProfile")}
          onPress={() => navigation.navigate("EditProfile")}
          style={styles.editButton}
        />

        <Button
          title={i18n.t("storage")}
          onPress={() => navigation.navigate("StorageSettings")}
          style={styles.editButton}
        />

        <Button
          title={i18n.t("logout")}
          variant="danger"
          onPress={handlePressLogout}
          style={styles.logoutButton}
        />

        <TouchableOpacity
          style={styles.termsEntry}
          onPress={() => setTermsVisible(true)}
          accessibilityRole="link"
        >
          <AppText variant="link" size="sm">{termsCopy.linkText}</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteAccountButton, deletingAccount && styles.disabledButton]}
          onPress={confirmDeleteOwnAccount}
          disabled={deletingAccount}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("deleteOwnAccount")}
        >
          {deletingAccount ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <AppText variant="link" size="sm" color="danger">
              {i18n.t("deleteOwnAccount")}
            </AppText>
          )}
        </TouchableOpacity>
      </ScrollView>

      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
    </SafeAreaView>
  );
}

export function ChangePasswordPage({ navigation }) {
  const styles = useStyles();
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
      <PasswordField
        size="md"
        placeholder={i18n.t("currentPassword")}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        containerStyle={styles.passwordInputTop}
      />
      <PasswordField
        size="md"
        placeholder={i18n.t("newPassword")}
        value={newPassword}
        onChangeText={setNewPassword}
        containerStyle={styles.passwordInput}
      />
      <PasswordField
        size="md"
        placeholder={i18n.t("confirmNewPassword")}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        containerStyle={styles.passwordInput}
      />

      <Button
        title={i18n.t("updatePassword")}
        onPress={handleChangePassword}
        loading={submitting}
        style={styles.changePasswordButton}
      />
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
    <View style={legacyStyles.container}>
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
            <View style={legacyStyles.appCard}>
              <Text style={legacyStyles.detail}>
                {i18n.t("applicant")}
                {item.contact}
              </Text>
              <Text style={legacyStyles.detail}>
                {i18n.t("type")}
                {item.applicationType}
              </Text>
              <Text style={legacyStyles.detail}>
                {i18n.t("date")}
                {parseServerDate(item.submittedAt)?.toLocaleDateString() ?? ""}
              </Text>
              <Text style={legacyStyles.detail}>
                {i18n.t("remarks")} {item.remarks}
              </Text>
            </View>
          )}
        />
      ) : (
        <Text style={legacyStyles.noData}>{i18n.t("noApplications")}</Text>
      )}
    </View>
  );
}

const WIDE_TILE_SIZE = 140; // fixed tile size on tablets
const BADGE_SIZE = 22; // count pill on a tile
const SECTION_RADIUS = 10; // section wrappers (admin, instructor, profile)
const TILE_RADIUS = 10; // corners of an admin / instructor tile
// Light shadow under the settings rows
const ROW_SHADOW = Platform.select({
  web: { boxShadow: "0px 1px 2px rgba(0,0,0,0.1)" },
  default: {
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.backgroundMuted,
    padding: t.spacing.base,
  },
  scrollContent: { flexGrow: 1 },
  adminContainer: {
    padding: t.spacing.base,
    borderRadius: SECTION_RADIUS,
    marginBottom: 0,
    paddingBottom: 0,
    alignItems: "stretch",
  },
  // Wide-screen (tablet/iPad) overrides: tighten the vertical rhythm so the admin,
  // instructor, and profile sections sit close together instead of spreading out.
  adminContainerWide: {
    paddingTop: t.spacing.xs,
  },
  subHeaderWide: {
    marginVertical: t.spacing.xs,
  },
  gridContainerWide: {
    marginTop: t.spacing.sm,
  },
  // Fixed compact squares instead of ~31% of a wide screen (which balloons to
  // ~240px buttons, only 3 per row); ~140px fits 5–6 per row and keeps rows short.
  optionButtonWide: {
    width: WIDE_TILE_SIZE,
    flexBasis: WIDE_TILE_SIZE,
    marginBottom: t.spacing.sm,
  },
  profileContainer: {
    padding: t.spacing.md,
    borderRadius: SECTION_RADIUS,
    marginBottom: t.spacing.xl,
    marginTop: 0,
    paddingTop: 0,
  },
  subHeader: {
    marginVertical: t.spacing.md,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: t.spacing.lg,
  },
  profileImage: {
    borderWidth: 2,
    borderColor: t.colors.primary,
  },
  detailContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.row,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    ...ROW_SHADOW,
  },
  detailIcon: {
    marginRight: t.spacing.base,
  },
  detailTextContainer: {
    flex: 1,
  },
  chevron: { marginLeft: t.spacing.md },
  repeatIcon: { marginRight: t.spacing.xs },
  gridWrapper: { flexShrink: 1 },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignContent: "flex-start",
    alignSelf: "flex-start",
    marginTop: t.spacing.md,
    marginBottom: 0,
    gap: t.spacing.sm,
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
    backgroundColor: t.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: TILE_RADIUS,
    marginBottom: t.spacing.base,
    paddingHorizontal: t.spacing.xs,
  },
  optionText: {
    marginTop: t.spacing.xs,
    textAlign: "center",
    flexWrap: "wrap",
  },
  // Matches the unread pill on a conversation row in ChatHomePage, so a count on
  // an admin tile reads the same way as a count anywhere else in the app.
  optionBadge: {
    position: "absolute",
    top: t.spacing.sm,
    right: t.spacing.sm,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: t.spacing.xs,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.badge,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutButton: {
    marginVertical: t.spacing.lg,
    marginHorizontal: t.spacing.md,
  },
  termsEntry: {
    alignItems: "center",
    paddingVertical: t.spacing.sm,
    marginTop: t.spacing.xs,
    marginHorizontal: t.spacing.md,
  },
  deleteAccountButton: {
    alignItems: "center",
    paddingVertical: t.spacing.md,
    marginBottom: t.spacing["2xl"],
    marginHorizontal: t.spacing.md,
  },
  disabledButton: {
    opacity: t.components.button.disabledOpacity,
  },
  editButton: {
    marginVertical: t.spacing.md,
    marginHorizontal: t.spacing.md,
  },
  guestContent: {
    flexGrow: 1,
    paddingTop: t.spacing.lg,
  },
  guestPrompt: {
    marginTop: t.spacing.xs,
    paddingHorizontal: t.spacing.md,
  },
  guestPromptText: {
    textAlign: "center",
    marginHorizontal: t.spacing.md,
    marginBottom: t.spacing.sm,
  },
  passwordInputTop: {
    marginTop: t.spacing["2xl"],
    marginBottom: t.spacing.md,
  },
  passwordInput: {
    marginVertical: t.spacing.md,
  },
  changePasswordButton: {
    marginTop: t.spacing["3xl"],
    marginBottom: t.spacing.lg,
  },
}));

// ManageApplicationsPage (admin) still uses its original styles
const legacyStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 15,
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
});
