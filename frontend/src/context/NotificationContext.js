import React, {
createContext,
useContext,
useState,
useEffect,
useRef,
} from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotificationsAsync } from "../utils/registerForPushNotificationsAsync";
import { registerPushTokenForLogin, unregisterPushToken, deactivatePushToken } from "../service/PushNotificationService";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "./UserContext";

// Create the NotificationContext with default value of undefined
const NotificationContext = createContext(undefined);

// Custom hook to use the NotificationContext
export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error(
        "useNotification must be used within a NotificationProvider"
        );
    }
    return context;
    };

// NotificationProvider component that manages notification state and listeners
export const NotificationProvider = ({ children }) => {
    const [expoPushToken, setExpoPushToken] = useState(null);
    const [notification, setNotification] = useState(null);
    const [error, setError] = useState(null);

    const notificationListener = useRef();
    const responseListener = useRef();

    // const { user } = useContext(UserContext);

    const { user, userReady, deviceId } = useContext(UserContext);


    const navigation = useNavigation();

    // The notification-tap handler runs from an event listener whose closure
    // can hold a stale `user`; the ref always reflects the latest value.
    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        if (!userReady) return;
      
        const listener1 = Notifications.addNotificationReceivedListener((notification) => {
          setNotification(notification);
        });

        const listener2 = Notifications.addNotificationResponseReceivedListener(async (response) => {
          const data = response.notification.request.content.data;
          const { conversationId, conversationType, threadId, eventId } = data;

          await waitForUserToBeReady();

          if (!userRef.current) {
            navigation.navigate("Login");
          } else if (conversationType === "quiz-graded") {
            // "Quiz graded" learning notification: quizId rides on conversationId.
            navigation.navigate("QuizResults", { quizId: conversationId });
          } else if (conversationType === "thread" && threadId != null) {
            // A reply in a topic this person follows. The id arrives in its own
            // field rather than as a conversation id, so builds that predate
            // topics fall through to merely opening the app instead of being
            // sent into an unrelated chat. ThreadDetail loads the rest from it.
            navigation.navigate("ThreadDetail", { thread: { id: threadId } });
          } else if (conversationType === "new-member") {
            // Admin alert: someone registered and is waiting to be verified.
            // Manage Users is where that happens, so land them there rather
            // than on the home screen with nothing to act on.
            navigation.navigate("ManageUsers");
          } else if (conversationType === "event-reminder" && eventId != null) {
            // "An event you registered for starts soon." The id rides in its own
            // key, never conversationId, so older builds just open the app.
            navigation.navigate("Events Detail", { eventId });
          } else if (conversationType === "learning") {
            // Enrolment, completion, quiz-passed, achievement and goal pushes
            // carry no conversation — land the learner on their courses hub
            // instead of an empty chat.
            navigation.navigate("MyCourses");
          } else if (conversationId != null) {
            navigation.navigate("Chat", { conversationId, conversationType });
          }
          // Anything else (an unknown type carrying no id) just opens the app.
        });

        return () => {
      listener1.remove();
      listener2.remove();
    };
      }, [userReady]);

      const waitForUserToBeReady = async (maxRetries = 15) => {
        let attempt = 0;
        while (!userRef.current && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          attempt++;
        }
      };


    // Handle push token registration for login (using authToken)
    const handleLoginPushToken = async () => {
        try {
        const pushToken = await registerForPushNotificationsAsync();  // Get Expo push token
        setExpoPushToken(pushToken);  // Set token in state
        const deviceType = Platform.OS === "android" ? "android" : "ios"; // Dynamically determine device type
        // Storage is the source of truth for deviceId (created at app init, and the
        // login call itself read it from there). The context state snapshot can lag
        // behind — relying on it used to silently skip backend registration, leaving
        // the session without pushes.
        const storedDeviceId = (await AsyncStorage.getItem("deviceId")) || deviceId;
        if (!storedDeviceId) {
            throw new Error("Device ID is not available for push registration");
        }
        await registerPushTokenForLogin(pushToken, deviceType, storedDeviceId);  // Register token with backend for login
        } catch (error) {
        // Nothing renders `error`, so without this a device that never obtained a
        // token just silently receives no pushes for the whole session.
        console.warn("⚠️ Push token registration failed (login):", error?.message || error);
        setError(error);
        }
    };

    const handleDeactivatePushToken = () => {
        if (expoPushToken) {
          deactivatePushToken(expoPushToken)  // Deactivate the token on backend
            .then(() => setExpoPushToken(null))  // Clear token from state
            .catch((error) => console.error("Failed to deactivate token:", error));
        }
      };
    
      const handleUnregisterPushToken = () => {
        if (expoPushToken) {
          unregisterPushToken(expoPushToken)  // Unregister the token from backend
            .then(() => setExpoPushToken(null))  // Clear token from state
            .catch((error) => console.error("Failed to unregister token:", error));
        }
      };

    return (
        <NotificationContext.Provider value={{ expoPushToken, notification, error, handleLoginPushToken, handleDeactivatePushToken,
            handleUnregisterPushToken, }}>
        {children}
        </NotificationContext.Provider>
    );
};
