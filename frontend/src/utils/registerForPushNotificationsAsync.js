import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  // Device.isDevice is false on every emulator, but an Android AVD built on a
  // Google Play system image (tag google_apis_playstore) runs Play services and
  // FCM issues it a real token — rejecting those blocks the emulator most of our
  // Android testing happens on. iOS simulators genuinely cannot get an APNs
  // token, so they still bail. An Android image without Play services falls
  // through to getExpoPushTokenAsync below and fails there, with a real reason.
  if (!Device.isDevice && Platform.OS !== "android") {
    throw new Error("Push notifications require a physical iOS device");
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    throw new Error(
      "Permission not granted to get push token for push notification!"
    );
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    throw new Error("Project ID not found");
  }

  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    throw new Error(`${e}`);
  }
}
