import React, {
createContext,
useContext,
useState,
useEffect,
useRef,
} from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerForPushNotificationsAsync } from "../utils/registerForPushNotificationsAsync";
import { registerPushTokenForLogin, registerPushTokenForRegister, unregisterPushToken, deactivatePushToken } from "../service/PushNotificationService";
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
          const { conversationId, conversationType } = data;

          await waitForUserToBeReady();

          if (!userRef.current) {
            navigation.navigate("Login");
          } else if (conversationType === "quiz-graded") {
            // "Quiz graded" learning notification: quizId rides on conversationId.
            navigation.navigate("QuizResults", { quizId: conversationId });
          } else {
            navigation.navigate("Chat", { conversationId, conversationType });
          }
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
        if (deviceId) {
            await registerPushTokenForLogin(pushToken, deviceType, deviceId);  // Register token with backend for login
        }
        // await registerPushTokenForLogin(pushToken, deviceType);  // Register token with backend for login
        } catch (error) {
        setError(error);
        }
    };

    // Handle push token registration for registration (without authToken, inactive)
    const handleRegisterPushToken = async (userId) => {
        try {
        const pushToken = await registerForPushNotificationsAsync();  // Get Expo push token
        setExpoPushToken(pushToken);  // Set token in state
        const deviceType = Platform.OS === "android" ? "android" : "ios"; // Dynamically determine device type
        if (deviceId) {
            await registerPushTokenForRegister(pushToken, userId, deviceType, deviceId);  // Register token with backend for registration
        }
        } catch (error) {
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
        <NotificationContext.Provider value={{ expoPushToken, notification, error, handleLoginPushToken, handleRegisterPushToken, handleDeactivatePushToken,
            handleUnregisterPushToken, }}>
        {children}
        </NotificationContext.Provider>
    );
};
