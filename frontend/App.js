import 'react-native-reanimated';
import React, { useContext } from "react";
import { Text } from "react-native";
import { Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import "text-encoding";
import { Ionicons } from "@expo/vector-icons";

// Import your Chat and Register screens
import WelcomePage from "./src/pages/Auth/WelcomePage";
import ChatPage from "./src/pages/Social/ChatPage"; // Assuming ChatPage is in another file
import RegisterPage from "./src/pages/Auth/RegisterPage"; // Assuming RegisterPage is in another file
import LoginPage, { ForgotPasswordPage } from "./src/pages/Auth/LoginPage";
import TestPage from "./src/pages/TestPage";
import OthersPage, { OthersSectionPage } from "./src/pages/Others/OthersPage";
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
import { UserProvider } from "./src/context/UserContext";
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
import ManageEventsPage, {
  EventFormPage,
} from "./src/pages/Others/ManageEventsPage";
import EditProfilePage from "./src/pages/Others/EditProfilePage";
import { LanguageProvider } from "./src/context/LanguageContext";
import { LanguageContext } from "./src/context/LanguageContext";
import "./i18n";
import i18n from "./i18n";
import { NotificationProvider } from "./src/context/NotificationContext";
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
import MyCoursesScreen from "./src/learning/screens/MyCoursesScreen";
import WishlistScreen from "./src/learning/screens/WishlistScreen";
import LeaveReviewScreen from "./src/learning/screens/LeaveReviewScreen";
import QuizScreen from "./src/learning/screens/QuizScreen";
import CertificatesScreen from "./src/learning/screens/CertificatesScreen";
import CertificateViewerScreen from "./src/learning/screens/CertificateViewerScreen";
import AchievementsScreen from "./src/learning/screens/AchievementsScreen";
import LearningGoalScreen from "./src/learning/screens/LearningGoalScreen";

// Sidebar for desktop browsers
import { useWindowDimensions, View } from "react-native";
//import { createDrawerNavigator } from "@react-navigation/drawer";
import Sidebar from "./src/components/Sidebar";

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
          } else if (route.name === "Others") {
            iconName = focused
              ? "information-circle"
              : "information-circle-outline";
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
        name="Others"
        component={OthersPage}
        options={{ headerTitle: i18n.t("Others") }}
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
          <Stack.Screen name="Others" component={OthersPage} />
          <Stack.Screen name="Settings" component={ProfilePage} />
        </Stack.Navigator>
      </View>
    </View>
  );
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


// Main App Navigator for stack and bottom tabs
export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <NavigationContainer
      linking={Platform.OS === "web" ? linking : undefined}
    >
      <QueryClientProvider client={queryClient}>
      <UserProvider>
        <AuthProvider>
        <NotificationProvider>
          <LanguageProvider>
            <ChatProvider>
              <WebSocketProvider>
                <Stack.Navigator initialRouteName="Welcome">
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
                    component={Platform.OS === "web" ? ChatPage : ChatHomePage}
                  />
                  <Stack.Screen name="Chat" component={ChatPage} />
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
                  <Stack.Screen name="Login" component={LoginPage} />
                  <Stack.Screen
                    name="OthersSection"
                    component={OthersSectionPage}
                    options={{ headerTitle: "" }}
                  />
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
              </WebSocketProvider>
            </ChatProvider>
          </LanguageProvider>
        </NotificationProvider>
        </AuthProvider>
      </UserProvider>
      </QueryClientProvider>
    </NavigationContainer>
  );
}
