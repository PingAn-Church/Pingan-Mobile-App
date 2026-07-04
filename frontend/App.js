import 'react-native-reanimated';
import React, { useContext, useState, useEffect, useRef } from "react";
import { Text } from "react-native";
import { Platform } from "react-native";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import "text-encoding";
import { Ionicons } from "@expo/vector-icons";

// Import your Chat and Register screens
import WelcomePage from "./src/pages/Auth/WelcomePage";
import ChatPage from "./src/pages/Social/ChatPage"; // Assuming ChatPage is in another file
import RegisterPage from "./src/pages/Auth/RegisterPage"; // Assuming RegisterPage is in another file
import VerificationCodePage from "./src/pages/Auth/VerificationCodePage";
import LoginPage, { ForgotPasswordPage } from "./src/pages/Auth/LoginPage";
import ProfilePage, {
  ManageApplicationsPage,
  ChangePasswordPage,
} from "./src/pages/Others/ProfilePage";
import HomePage, { VideosPage } from "./src/pages/Homepage/HomePage";
import FormApplicationPage from "./src/pages/Homepage/FormApplicationPage";
import CommunityPage from "./src/pages/Activity/CommunityPage";
import SocialPage from "./src/pages/Social/SocialPage";
import ThreadHomePage from "./src/pages/Social/ThreadHomePage";
import ThreadDetailPage from "./src/pages/Social/ThreadDetailPage";
import CreateThreadPage from "./src/pages/Social/CreateThreadPage";
import EditThreadPage from "./src/pages/Social/EditThreadPage";
import ChatHomePage from "./src/pages/Social/ChatHomePage";
import NewChatScreen from "./src/pages/Social/NewChatScreen";
import NewGroupScreen from "./src/pages/Social/NewGroupScreen";
import DetailedGroupChatPage from "./src/pages/Social/DetailedGroupChatPage";
import DetailedPrivateChatPage from "./src/pages/Social/DetailedPrivateChatPage";
import MyActivityPage from "./src/pages/Activity/MyActivityPage";
import ActivityDetailPage from "./src/pages/Activity/ActivityDetailPage";
import { UserProvider, UserContext } from "./src/context/UserContext";
import { ChatProvider } from "./src/context/ChatContext";
import { WebSocketProvider } from "./src/context/WebSocketProvider";
import ManageVideosPage, {
  AddVideoPage,
} from "./src/pages/Others/ManageVideosPage";
import ManagePicturesPage, {
  AddPicturePage,
} from "./src/pages/Others/ManagePicturesPage";
import ManageAnnouncementsPage, {
  AddAnnouncementPage,
} from "./src/pages/Others/ManageAnnouncementsPage";
import ManageAdminsPage, {
  ManageUsersPage,
} from "./src/pages/Others/ManageAdminsPage";
import ManageInstructorsPage from "./src/pages/Others/ManageInstructorsPage";
import ManageReportingPage from "./src/pages/Others/ManageReportingPage";
import ManageEventsPage, {
  EventFormPage,
} from "./src/pages/Others/ManageEventsPage";
import EditProfilePage from "./src/pages/Others/EditProfilePage";
import StorageSettingsPage from "./src/pages/Others/StorageSettingsPage";
import { init as initMediaCache } from "./src/service/MediaCacheService";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { LanguageProvider } from "./src/context/LanguageContext";
import { LanguageContext } from "./src/context/LanguageContext";
import "./i18n";
import i18n from "./i18n";
import { NotificationProvider } from "./src/context/NotificationContext";
import { AppUpdateProvider } from "./src/context/AppUpdateContext";
import * as Notifications from "expo-notifications";

// E-learning module
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/learning/lib/queryClient";
import { AuthProvider } from "./src/learning/context/AuthContext";
import CoursesScreen from "./src/learning/screens/CoursesScreen";
import CourseDetailScreen from "./src/learning/screens/CourseDetailScreen";
import LearningVideoScreen from "./src/learning/screens/VideoScreen";
import LearningDocumentScreen from "./src/learning/screens/DocumentScreen";
import CourseManagementScreen from "./src/learning/screens/instructor/CourseManagementScreen";
import CourseEditorScreen from "./src/learning/screens/instructor/CourseEditorScreen";
import CourseStatsScreen from "./src/learning/screens/instructor/CourseStatsScreen";
import GradingScreen from "./src/learning/screens/instructor/GradingScreen";
import MyCoursesScreen from "./src/learning/screens/MyCoursesScreen";
import WishlistScreen from "./src/learning/screens/WishlistScreen";
import LeaveReviewScreen from "./src/learning/screens/LeaveReviewScreen";
import QuizScreen from "./src/learning/screens/QuizScreen";
import QuizResultsScreen from "./src/learning/screens/QuizResultsScreen";
import CertificatesScreen from "./src/learning/screens/CertificatesScreen";
import CertificateViewerScreen from "./src/learning/screens/CertificateViewerScreen";
import AchievementsScreen from "./src/learning/screens/AchievementsScreen";
import LearningGoalScreen from "./src/learning/screens/LearningGoalScreen";

// Sidebar for desktop browsers
import { useWindowDimensions, View, Animated, StyleSheet } from "react-native";
//import { createDrawerNavigator } from "@react-navigation/drawer";
import Sidebar from "./src/components/Sidebar";
import EntryScreen from "./src/components/EntryScreen";
import HeaderBackButton from "./src/components/HeaderBackButton";

// App is light-only (iOS/Android forced light). Pin the web document to a light
// color-scheme so the browser's dark mode doesn't auto-style native controls,
// scrollbars, or any unstyled element against our hardcoded light backgrounds.
if (Platform.OS === "web" && typeof document !== "undefined") {
  document.documentElement.style.colorScheme = "light";
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();

const Tab = createBottomTabNavigator();

// Bottom Tab Navigator for Home, Community, Chat, Others
function BottomTabNavigator() {
  const { language } = useContext(LanguageContext); // to listen to language change

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Home") {
            iconName = focused ? "home" : "home-outline";
          } else if (route.name === "Events") {
            iconName = focused ? "calendar" : "calendar-outline";
          } else if (route.name === "Social") {
            iconName = focused ? "chatbubble" : "chatbubble-outline";
          } else if (route.name === "Settings") {
            iconName = focused ? "settings" : "settings-outline";
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "blue",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          height: 90,            // Increased height for more space
          paddingBottom: 30,     // Safe padding at the bottom
          paddingTop: 10,        // Optional: adds spacing above icons
          backgroundColor: "#fff", // Consistent background
          borderTopWidth: 0.5,   // Optional: subtle separator
          borderTopColor: "#ccc",
        },

        tabBarLabel: ({ focused }) => (
          <Text
            style={{
              fontSize: 14, // Adjust label font size
              fontWeight: focused ? "bold" : "normal", // Bold label for active tab
              color: focused ? "blue" : "gray", // Change color based on active/inactive state
            }}
          >
            {i18n.t(route.name)}
          </Text>
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomePage}
        options={{ headerTitle: i18n.t("Home") }}
      />
      <Tab.Screen
        name="Events"
        component={MyActivityPage}
        options={{ headerTitle: i18n.t("Events") }}
      />
      <Tab.Screen
        name="Social"
        component={SocialPage}
        options={{
          headerTitle: i18n.t("Social"),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfilePage}
        options={{ headerTitle: i18n.t("Settings") }}
      />
    </Tab.Navigator>
  );
}

//const Drawer = createDrawerNavigator();

function WebSidebarLayout() {
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View style={{ width: 260 }}>
        <Sidebar />
      </View>

      <View style={{ flex: 1 }}>
        <Stack.Navigator screenOptions={{ headerShown: true }}>
          <Stack.Screen name="Home" component={HomePage} />
          <Stack.Screen name="Events" component={MyActivityPage} />
          <Stack.Screen name="Social" component={SocialPage} />
          <Stack.Screen name="Settings" component={ProfilePage} />
        </Stack.Navigator>
      </View>
    </View>
  );
}



// Chat entry point. The two-pane ChatPage only renders its conversation
// sidebar at >=1024px, so narrower web windows (and native) get the
// ChatHomePage list — otherwise narrow web users would land on an empty
// pane with no way to pick or start a conversation.
function ChatHomeRoute(props) {
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 1024;
  return isWebDesktop ? <ChatPage {...props} /> : <ChatHomePage {...props} />;
}

const linking = {
  prefixes: ["http://localhost:8081", "exp://"],
  config: {
    screens: {
      ChatHome: "chats",
      Chat: "chats/:conversationId",
      DetailedPrivateChat: "private/:otherParticipantId",
      DetailedGroupChat: "group/:conversationId",
    },
  },
};


// Minimum time the branded entry overlay stays up so the ~1.6s dove animation
// (plus its wordmark fade) plays through, even when the session check resolves
// almost instantly (e.g. web with no stored token). Tune to taste.
const MIN_SPLASH_MS = 2000;
// Cross-fade duration when the entry overlay dissolves into the app.
const ENTRY_FADE_MS = 450;

// App-level entry overlay. The live navigator renders underneath from the very
// first frame; the branded EntryScreen is held on top until the session check
// is done AND the minimum splash time has elapsed, then cross-fades out to
// reveal whatever the app settled on (welcome screen or dashboard). Because it
// sits above the navigator, the dissolve is seamless on both native and web and
// survives the redirect to HomeTabs.
function EntryGate({ children }) {
  const { loading } = useContext(UserContext);
  const [minElapsed, setMinElapsed] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Ready once the session is resolved and the splash has had its moment. A
  // slow session check (slow network) extends the overlay past the floor.
  const ready = !loading && minElapsed;

  useEffect(() => {
    if (!ready) return;
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: ENTRY_FADE_MS,
      useNativeDriver: Platform.OS !== "web",
    });
    anim.start(({ finished }) => {
      if (finished) setOverlayMounted(false);
    });
    return () => anim.stop();
  }, [ready, opacity]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {overlayMounted && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity }]}
          pointerEvents={ready ? "none" : "auto"}
        >
          <EntryScreen />
        </Animated.View>
      )}
    </View>
  );
}

// Routes reachable without a session (the auth flow). Everything else requires login.
const PUBLIC_ROUTES = new Set([
  "Welcome",
  "Login",
  "Register",
  "VerificationCode",
  "ForgotPassword",
]);

const ROOT_BACK_FALLBACKS = {
  Login: "Welcome",
  Register: "Welcome",
  VerificationCode: "Register",
  ForgotPassword: "Login",
  ThreadHomePage: "HomeTabs",
  ThreadDetail: "ThreadHomePage",
  CreateThread: "ThreadHomePage",
  EditThread: "ThreadHomePage",
  ChatHome: "HomeTabs",
  Chat: "ChatHome",
  NewChat: "ChatHome",
  NewGroup: "ChatHome",
  DetailedPrivateChat: "ChatHome",
  DetailedGroupChat: "ChatHome",
  FormApplication: "HomeTabs",
  ManageApplications: "HomeTabs",
  ManageEvents: "HomeTabs",
  EventForm: "ManageEvents",
  "Events Detail": "HomeTabs",
  ManageVideos: "HomeTabs",
  AddVideo: "ManageVideos",
  VideosPage: "HomeTabs",
  ManagePictures: "HomeTabs",
  AddPicture: "ManagePictures",
  ManageAnnouncements: "HomeTabs",
  AddAnnouncement: "ManageAnnouncements",
  ManageAdmins: "HomeTabs",
  ManageUsers: "HomeTabs",
  ManageInstructors: "HomeTabs",
  ManageReporting: "HomeTabs",
  ChangePassword: "HomeTabs",
  EditProfile: "HomeTabs",
  StorageSettings: "HomeTabs",
  Learning: "HomeTabs",
  LearningCourseDetail: "Learning",
  LearningVideo: "Learning",
  LearningDocument: "Learning",
  CourseManagement: "HomeTabs",
  CourseEditor: "CourseManagement",
  CourseStats: "CourseManagement",
  QuizGrading: "CourseManagement",
  MyCourses: "Learning",
  Wishlist: "Learning",
  LeaveReview: "Learning",
  QuizScreen: "Learning",
  QuizResults: "Learning",
  Certificates: "Learning",
  CertificateViewer: "Certificates",
  Achievements: "Learning",
  LearningGoal: "Learning",
};

const rootStackScreenOptions = ({ navigation, route }) => {
  const fallbackRoute = ROOT_BACK_FALLBACKS[route.name];
  if (!fallbackRoute) return {};

  return {
    headerLeft: ({ tintColor }) => (
      <HeaderBackButton
        navigation={navigation}
        fallbackRoute={fallbackRoute}
        tintColor={tintColor}
      />
    ),
  };
};

// Global auth boundary: once the session is resolved, any time there's no logged-in
// user and the active route isn't public, send the user back to Welcome. This covers
// every screen (not just the homepage) — important on web where routes are URL-reachable.
function AuthGuard({ navigationRef }) {
  const { user, loading } = useContext(UserContext);

  useEffect(() => {
    if (loading) return; // wait until the session check settles (handled by EntryGate)

    const enforce = () => {
      if (!navigationRef.isReady()) return;
      const route = navigationRef.getCurrentRoute();
      if (!route) return;
      if (!user && !PUBLIC_ROUTES.has(route.name)) {
        navigationRef.reset({ index: 0, routes: [{ name: "Welcome" }] });
      }
    };

    enforce(); // run immediately (covers logout/expiry and the current route)
    const unsubscribe = navigationRef.addListener("state", enforce); // and on every navigation
    return unsubscribe;
  }, [user, loading, navigationRef]);

  return null;
}

// Main App Navigator for stack and bottom tabs
export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const navigationRef = useNavigationContainerRef();

  // Warm the media cache at startup: reconcile the on-disk files and enforce the
  // user's size budget (LRU eviction) before any chat media is requested.
  useEffect(() => {
    initMediaCache();
  }, []);

  return (
    <KeyboardProvider>
    <NavigationContainer
      ref={navigationRef}
      linking={Platform.OS === "web" ? linking : undefined}
    >
      <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AuthProvider>
        <NotificationProvider>
          <LanguageProvider>
            <AppUpdateProvider>
            <ChatProvider>
              <WebSocketProvider>
                <EntryGate>
                <AuthGuard navigationRef={navigationRef} />
                <Stack.Navigator initialRouteName="Welcome" screenOptions={rootStackScreenOptions}>
                  <Stack.Screen
                    name="Welcome"
                    component={WelcomePage}
                    options={{
                      headerShown: false, // Show header
                    }}
                  />
                  <Stack.Screen
                    name="ThreadHomePage"
                    component={ThreadHomePage}
                  />
                  <Stack.Screen
                    name="ThreadDetail"
                    component={ThreadDetailPage}
                  />
                  <Stack.Screen
                    name="CreateThread"
                    component={CreateThreadPage}
                  />
                  <Stack.Screen name="EditThread" component={EditThreadPage} />
                  <Stack.Screen
                    name="ChatHome"
                    component={ChatHomeRoute}
                  />
                  <Stack.Screen
                    name="Chat"
                    component={ChatPage}
                  />
                  <Stack.Screen name="NewChat" component={NewChatScreen} />
                  <Stack.Screen name="NewGroup" component={NewGroupScreen} />
                  <Stack.Screen
                    name="DetailedPrivateChat"
                    component={DetailedPrivateChatPage}
                  />
                  <Stack.Screen
                    name="DetailedGroupChat"
                    component={DetailedGroupChatPage}
                  />
                  <Stack.Screen name="Register" component={RegisterPage} />
                  <Stack.Screen name="VerificationCode" component={VerificationCodePage} />
                  <Stack.Screen name="Login" component={LoginPage} />
                  <Stack.Screen
                    name="FormApplication"
                    component={FormApplicationPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageApplications"
                    component={ManageApplicationsPage}
                  />
                  <Stack.Screen
                    name="ManageEvents"
                    component={ManageEventsPage}
                  />
                  <Stack.Screen
                    name="EventForm"
                    component={EventFormPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="Events Detail"
                    component={ActivityDetailPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageVideos"
                    component={ManageVideosPage}
                  />
                  <Stack.Screen
                    name="AddVideo"
                    component={AddVideoPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen name="VideosPage" component={VideosPage} />
                  <Stack.Screen
                    name="ManagePictures"
                    component={ManagePicturesPage}
                  />
                  <Stack.Screen
                    name="AddPicture"
                    component={AddPicturePage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageAnnouncements"
                    component={ManageAnnouncementsPage}
                  />
                  <Stack.Screen
                    name="AddAnnouncement"
                    component={AddAnnouncementPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageAdmins"
                    component={ManageAdminsPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageUsers"
                    component={ManageUsersPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageInstructors"
                    component={ManageInstructorsPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ManageReporting"
                    component={ManageReportingPage}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="ForgotPassword"
                    component={ForgotPasswordPage}
                  />
                  <Stack.Screen
                    name="ChangePassword"
                    component={ChangePasswordPage}
                  />
                  <Stack.Screen
                    name="EditProfile"
                    component={EditProfilePage}
                  />
                  <Stack.Screen
                    name="StorageSettings"
                    component={StorageSettingsPage}
                  />
                  <Stack.Screen
                    name="HomeTabs"
                    component={isDesktop ? WebSidebarLayout : BottomTabNavigator}
                    options={{ headerShown: false, headerTitle: "" }} // Hide header for bottom tabs
                  />
                  <Stack.Screen
                    name="Learning"
                    component={CoursesScreen}
                    options={{ headerTitle: "Learning" }}
                  />
                  <Stack.Screen
                    name="LearningCourseDetail"
                    component={CourseDetailScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="LearningVideo"
                    component={LearningVideoScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="LearningDocument"
                    component={LearningDocumentScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="CourseManagement"
                    component={CourseManagementScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="CourseEditor"
                    component={CourseEditorScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="CourseStats"
                    component={CourseStatsScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="QuizGrading"
                    component={GradingScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="MyCourses"
                    component={MyCoursesScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="Wishlist"
                    component={WishlistScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="LeaveReview"
                    component={LeaveReviewScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="QuizScreen"
                    component={QuizScreen}
                    options={{ headerTitle: "Quiz" }}
                  />
                  <Stack.Screen
                    name="QuizResults"
                    component={QuizResultsScreen}
                    options={{ headerTitle: "Quiz results" }}
                  />
                  <Stack.Screen
                    name="Certificates"
                    component={CertificatesScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="CertificateViewer"
                    component={CertificateViewerScreen}
                    options={{ headerTitle: "Certificate" }}
                  />
                  <Stack.Screen
                    name="Achievements"
                    component={AchievementsScreen}
                    options={{ headerTitle: "" }}
                  />
                  <Stack.Screen
                    name="LearningGoal"
                    component={LearningGoalScreen}
                    options={{ headerTitle: "" }}
                  />
                </Stack.Navigator>
                </EntryGate>
              </WebSocketProvider>
            </ChatProvider>
            </AppUpdateProvider>
          </LanguageProvider>
        </NotificationProvider>
        </AuthProvider>
      </UserProvider>
      </QueryClientProvider>
    </NavigationContainer>
    </KeyboardProvider>
  );
}
