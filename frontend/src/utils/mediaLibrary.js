import { Platform } from "react-native";
import { Asset, requestPermissionsAsync } from "expo-media-library";

export const MEDIA_LIBRARY_PERMISSION_DENIED = "Media library permission denied";

export const saveImageToLibrary = async (localUri) => {
  const androidApi = Platform.OS === "android" ? Number(Platform.Version) : null;
  const needsWritePermission =
    Platform.OS === "ios" || (Platform.OS === "android" && androidApi <= 29);

  if (needsWritePermission) {
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      throw new Error(MEDIA_LIBRARY_PERMISSION_DENIED);
    }
  }

  await Asset.create(localUri);
};
