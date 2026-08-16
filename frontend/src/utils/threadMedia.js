import * as ImagePicker from "expo-image-picker";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../service/OSSService";

/**
 * Pictures attached to threads and their replies.
 *
 * The picker only ever hands back a local file: nothing reaches OSS until the
 * post is actually sent, so a thread abandoned halfway leaves no orphaned upload
 * behind, and the preview the author sees costs nothing.
 */

/** Opens the library and returns a local uri, or null if the user backed out. */
export const pickThreadImage = async ({ allowsEditing = false } = {}) => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing,
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets?.[0]?.uri || null;
};

/**
 * Uploads a picked image and returns its stored object URL. Pass an already
 * stored URL (one that isn't a local file) and it is returned untouched, so
 * editing a thread without changing its picture re-uploads nothing.
 */
export const uploadThreadImage = async (uri) => {
  if (!uri) return null;
  if (!/^(file:|content:|ph:|assets-library:|blob:|data:)/i.test(uri)) return uri;

  const fileName = `thread_${Date.now()}.jpg`;
  const uploadUrl = await getPresignedUploadUrl(fileName, "thread");
  return await uploadFileToOSS(uri, uploadUrl);
};

/**
 * Removes an upload whose post never made it. Best-effort: the server refuses
 * (409) once the object is referenced by a saved thread or reply, which is
 * exactly the case where it must survive.
 */
export const discardThreadUpload = async (objectUrl) => {
  if (!objectUrl) return;
  try {
    await deleteOwnUpload(objectUrl, "thread");
  } catch (error) {
    if (error?.response?.status !== 409) {
      console.warn("Could not clean up an unreferenced thread image:", error?.message || error);
    }
  }
};
