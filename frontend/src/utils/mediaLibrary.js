import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";

export const MEDIA_LIBRARY_PERMISSION_DENIED = "Media library permission denied";

/**
 * The gallery is a native-only concept: expo-media-library ships no web
 * implementation, and browsers save through an <a download> element instead.
 * Every caller is expected to branch on Platform.OS before getting here, so
 * reaching this is a bug in the caller rather than something to show a user.
 */
const assertNativePlatform = () => {
  if (Platform.OS === "web") {
    throw new Error(
      "Saving to the media library is native-only; use a download link on web."
    );
  }
};

/**
 * Saves a file that already exists on this device into the system gallery.
 *
 * Android 11+ (API 30+) writes through MediaStore and needs no runtime
 * permission; only the legacy path (API <= 29) still requires
 * WRITE_EXTERNAL_STORAGE, which the manifest declares with maxSdkVersion="29".
 * iOS needs add-only access. Asking for write-only matters on both platforms:
 * on Android it stops expo-media-library from also requesting
 * READ_EXTERNAL_STORAGE, which this app deliberately no longer declares — an
 * undeclared permission is auto-denied and would fail the save outright.
 *
 * @param localUri file:// URI on this device
 * @throws MEDIA_LIBRARY_PERMISSION_DENIED when the user refuses the prompt
 */
export const saveImageToLibrary = async (localUri) => {
  assertNativePlatform();

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

/**
 * Downloads a remote image and saves it to the gallery under `fileName`.
 *
 * Asset.create takes the gallery's display name from the last path segment of
 * the file it is handed, so the scratch copy has to already carry the name the
 * user should see. Uniqueness therefore lives in the directory name rather
 * than the file name — otherwise every saved picture would show up in the
 * gallery with a timestamp-and-random-token prefix. The scratch directory is
 * removed once the asset exists, including when the save fails.
 *
 * @param remoteUri source URL (may carry a presigned query string)
 * @param fileName  gallery display name, e.g. "chat-image-1042.jpg"
 */
export const downloadImageToLibrary = async (remoteUri, fileName) => {
  assertNativePlatform();

  const scratchToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const scratchDirectory = new Directory(Paths.cache, "media-downloads", scratchToken);
  scratchDirectory.create({ idempotent: true, intermediates: true });

  try {
    const targetFile = new File(scratchDirectory, fileName);
    const downloadedFile = await File.downloadFileAsync(remoteUri, targetFile, {
      idempotent: true,
    });
    await saveImageToLibrary(downloadedFile.uri);
  } finally {
    if (scratchDirectory.exists) {
      scratchDirectory.delete();
    }
  }
};

/**
 * Saves a picture the app is already showing, whatever kind of URL it resolved
 * to: a browser gets a download link, a cached file:// copy goes straight into
 * the gallery, and anything remote is downloaded first.
 *
 * @param uri      what the <Image> was drawing
 * @param fileName gallery / download display name, e.g. "thread-photo-1042.jpg"
 * @throws MEDIA_LIBRARY_PERMISSION_DENIED when the user refuses the prompt
 */
export const saveShownImage = async (uri, fileName) => {
  if (!uri) {
    throw new Error("Image not available");
  }
  if (Platform.OS === "web") {
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.download = fileName;
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  }
  if (String(uri).startsWith("file://")) {
    await saveImageToLibrary(uri);
    return;
  }
  await downloadImageToLibrary(uri, fileName);
};

/** The extension in a URL's path, ignoring any query string; `fallback` when it has none. */
export const fileExtensionOf = (uri, fallback = "jpg") => {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(uri || ""));
  return match ? match[1].toLowerCase() : fallback;
};
