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

    // Register push notifications and set up listeners
    // useEffect(() => {
    //     // Register for push notifications
    //     // registerForPushNotificationsAsync().then(
    //     // (token) => setExpoPushToken(token),
    //     // (error) => setError(error)
    //     // );

    //     // Listen for incoming notifications
    //     notificationListener.current =
    //     Notifications.addNotificationReceivedListener((notification) => {
    //         console.log("🔔 Notification Received while app is running: ", notification);
    //         setNotification(notification);
    //     });

    //     // Listen for notification response (when user taps the notification)
    //     responseListener.current =
    //     Notifications.addNotificationResponseReceivedListener(async (response) => {
    //         const data = response.notification.request.content.data;
    //         const { conversationId, conversationType } = data;
        
    //         // Wait for user to be restored by UserProvider
    //         await waitForUserToBeReady(2);
        
    //         // Account for scenario where user clicks on old notification while logged  out.
    //         if (!user) {
    //         console.log("⚠️ Still no user after delay, navigating to login");
    //         navigation.navigate("Login");
    //         } else {
    //         console.log("✅ User restored, navigating to Chat");
    //         navigation.navigate("Chat", { conversationId, conversationType });
    //         }
    //     });
        
    //     const waitForUserToBeReady = async (maxRetries = 15) => {
    //         let attempt = 0;
    //         while (!user && attempt < maxRetries) {
    //         await new Promise((resolve) => setTimeout(resolve, 200));
    //         attempt++;
    //         }
    //     };
  
    //     // Notifications.addNotificationResponseReceivedListener((response) => {
    //     //     console.log(
    //     //     "🔔 Notification Response: User interacts with notification",
    //     //     JSON.stringify(response, null, 2),
    //     //     JSON.stringify(response.notification.request.content.data, null, 2)
    //     //     );
    //     //     // Handle the notification response here (e.g., navigate to a specific screen)
    //     //     console.log("THIS IS THE DATA", JSON.stringify(response.notification.request.content.data));

    //     //     const { conversationId, conversationType } = response.notification.request.content.data;

    //     //     if (!user) {
    //     //         // If the user is not logged in, redirect to the login page
    //     //         console.log("User is not logged in, redirecting to login page...");
    //     //         navigation.navigate("Login");  // Redirect to Login Page
    //     //       } else {
    //     //         // If the user is logged in, navigate to the Chat screen
    //     //         if (conversationId) {
    //     //           navigation.navigate("Chat", { conversationId, conversationType });
    //     //         }
    //     //       }

    //     // });

    //     // Clean up listeners when the component is unmounted
    //     return () => {
    //         if (notificationListener.current) {
    //             Notifications.removeNotificationSubscription(notificationListener.current);
    //         }
    //         if (responseListener.current) {
    //             Notifications.removeNotificationSubscription(responseListener.current);
    //         }
    //     };
    // }, []);

    useEffect(() => {
        if (!userReady) return;
      
        const listener1 = Notifications.addNotificationReceivedListener((notification) => {
          console.log("🔔 Notification received in foreground:", notification);
          setNotification(notification);
        });
      
        const listener2 = Notifications.addNotificationResponseReceivedListener(async (response) => {
          const data = response.notification.request.content.data;
          const { conversationId, conversationType } = data;
      
          await waitForUserToBeReady();
      
          if (!user) {
            console.log("⚠️ No user — navigating to login");
            navigation.navigate("Login");
          } else {
            console.log("✅ Navigating to Chat from notification");
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
        while (!user && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          attempt++;
        }
      };      
      

    // Handle registering the token after user login
    // const handleRegisterPushToken = async () => {
    //     try {
    //         console.log("PUSH NOTIF CHECK");
    //         const pushToken = await registerForPushNotificationsAsync();  // Get Expo push token
    //         setExpoPushToken(pushToken);  // Set token in state
    //         const deviceType = Platform.OS === "android" ? "android" : "ios"; // Dynamically determine device type
    //         await registerPushToken(pushToken, deviceType);  // Register token with backend
    //     } catch (error) {
    //         setError(error);
    //     }
    // };

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
