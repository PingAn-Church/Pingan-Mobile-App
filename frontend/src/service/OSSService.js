import axios from "axios";
import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

/**
 * Resize (longest edge) and re-encode an image to JPEG before upload, to cut OSS
 * storage and bandwidth. Only downscales (never upscales) and always re-compresses,
 * so even full-quality phone photos shrink dramatically. Returns a new local uri;
 * falls back to the original uri on any failure. Non-image uploads must skip this.
 */
export const compressImage = async (uri, { maxDimension = 1280, quality = 0.7 } = {}) => {
  try {
    const size = await new Promise((resolve) => {
      Image.getSize(uri, (w, h) => resolve({ w, h }), () => resolve(null));
    });

    const actions = [];
    if (size && Math.max(size.w, size.h) > maxDimension) {
      actions.push(
        size.w >= size.h
          ? { resize: { width: maxDimension } }
          : { resize: { height: maxDimension } }
      );
    }

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch (error) {
    console.warn("Image compression failed, using original:", error?.message);
    return uri;
  }
};

const normalizeFileName = (fileName) => {
  const raw = String(fileName || "");
  const baseName = raw.split(/[\\/]/).pop() || "";
  const normalized = baseName
    .normalize("NFKC")
    .trim()
    .replace(/[\s\u00A0]+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_");

  return normalized || `upload_${Date.now()}`;
};

const normalizePresignedUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw.includes("?")) return raw;

  const [base, query] = raw.split("?");
  // Keep '+' intact inside signed query values. Some clients/servers decode '+' as space.
  const safeQuery = query.replace(/\+/g, "%2B");
  return `${base}?${safeQuery}`;
};

export const getPresignedUploadUrl = async (fileName, fileType) => {
  try {
    const normalizedFileName = normalizeFileName(fileName);
    const response = await axios.get(
      apiUrl(`/oss/presigned-upload-url`),
      {
        params: { fileName: normalizedFileName, fileType },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching presigned upload URL:", error);
    throw error;
  }
};

// export const uploadFileToOSS = async (fileUri, presignedUrl) => {
//     try {
//         const response = await fetch(presignedUrl, {
//             method: "PUT",
//             body: await fetch(fileUri).then(res => res.blob()),
//             headers: { "Content-Type": "image/jpeg" }
//         });

//         if (response.ok) {
//             return presignedUrl.split("?")[0]; // Return the file URL without query parameters
//         } else {
//             throw new Error("Failed to upload file to OSS");
//         }
//     } catch (error) {
//         console.error("Upload error:", error);
//     }
// };

/**
 * Uploads a file to Alibaba Cloud OSS using the presigned URL.
 */
const inferContentTypeFromFileUri = (fileUri) => {
  const cleanUri = String(fileUri || "").split("?")[0].split("#")[0];
  const fileExtension = cleanUri.includes(".")
    ? cleanUri.split(".").pop().toLowerCase()
    : "";

  if (fileExtension === "jpg" || fileExtension === "jpeg") {
    return "image/jpeg";
  }
  if (fileExtension === "png") {
    return "image/png";
  }
  if (fileExtension === "m4a" || fileExtension === "mp4") {
    return "audio/mp4";
  }
  if (fileExtension === "webm") {
    return "audio/webm";
  }
  if (fileExtension === "mp3") {
    return "audio/mpeg";
  }
  if (fileExtension === "wav") {
    return "audio/wav";
  }

  return "application/octet-stream";
};

const inferContentTypeFromSignedUrl = (signedUrl) => {
  try {
    const pathname = decodeURIComponent(new URL(String(signedUrl || "")).pathname);
    const objectKey = pathname.split("/").pop() || "";
    const extension = objectKey.includes(".")
      ? objectKey.split(".").pop().toLowerCase()
      : "";

    if (extension === "jpg" || extension === "jpeg") {
      return "image/jpeg";
    }
    if (extension === "png") {
      return "image/png";
    }
    if (extension === "m4a" || extension === "mp4") {
      return "audio/mp4";
    }
    if (extension === "webm") {
      return "audio/webm";
    }
    if (extension === "mp3") {
      return "audio/mpeg";
    }
    if (extension === "wav") {
      return "audio/wav";
    }
  } catch {
    // Ignore parsing failures and let other inference paths handle it.
  }

  return null;
};

export const uploadFileToOSS = async (fileUri, presignedUrl, contentTypeOverride) => {
  try {
    const normalizedPresignedUrl = normalizePresignedUrl(presignedUrl);
    console.log("Uploading to OSS:", normalizedPresignedUrl);

    const contentType =
      contentTypeOverride ||
      inferContentTypeFromSignedUrl(normalizedPresignedUrl) ||
      inferContentTypeFromFileUri(fileUri);

    // Compress images before upload (skips audio/other types). The presigned URL is
    // signed for image/jpeg, so JPEG output keeps the signature valid.
    const sourceUri =
      typeof contentType === "string" && contentType.startsWith("image/")
        ? await compressImage(fileUri)
        : fileUri;

    // Fetch the file as a blob
    const fileResponse = await fetch(sourceUri);
    const blob = await fileResponse.blob();
    // Some runtimes derive Content-Type from Blob.type. Keep it aligned with presigned signature.
    const uploadBlob =
      blob?.type &&
      contentType &&
      blob.type !== contentType &&
      typeof blob.slice === "function"
        ? blob.slice(0, blob.size, contentType)
        : blob;

    // Upload the file to OSS
    const response = await fetch(normalizedPresignedUrl, {
      method: "PUT",
      body: uploadBlob,
      headers: {
        "Content-Type": contentType, // ✅ Must match the presigned URL signature
      },
    });

    console.log("Upload response status:", response.status);
    console.log("Upload response headers:", response.headers);
    const responseBody = await response.text();
    console.log("Upload response body:", responseBody);

    if (response.ok) {
      return presignedUrl.split("?")[0]; // ✅ Return the file URL without query parameters
    } else {
      throw new Error(`Upload failed. Status: ${response.status}. Body: ${responseBody}`);
    }
  } catch (error) {
    console.error("Upload error:", {
      message: error?.message,
      fileUri,
      contentTypeOverride,
    });
    throw error;
  }
};

/**
 * Fetches a presigned download URL for viewing images securely.
 */
export const getPresignedDownloadUrl = async (fileName, fileType) => {
  try {
    const token = await getAuthToken();
    const response = await axios.get(
      apiUrl(`/oss/presigned-download-url`),
      {
        params: { fileName, fileType },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    return response.data; // Returns the temporary URL
  } catch (error) {
    console.error("Error fetching presigned download URL:", error);
    return null;
  }
};

export const resolvePresignedAssetUrl = async (assetUrl, fileType) => {
  try {
    const rawUrl = String(assetUrl || "").trim();
    if (!rawUrl) return null;

    const fileName = rawUrl.split("?")[0].split("#")[0].split("/").pop();
    if (!fileName) return null;

    return await getPresignedDownloadUrl(fileName, fileType);
  } catch (error) {
    console.error(`Error resolving presigned asset URL for ${fileType}:`, error);
    return null;
  }
};

export const fetchPictures = async (fileType, { size = 20, marker } = {}) => {
  try {
    const token = await getAuthToken();
    const response = await axios.get(
      apiUrl(`/oss/list-pictures`),
      {
        params: { fileType, size, ...(marker ? { marker } : {}) },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching pictures:", error);
    return { success: false, data: [], pagination: { hasMore: false, nextMarker: null } };
  }
};

export const deletePicture = async (fileName, fileType) => {
  try {
    const token = await getAuthToken();
    await axios.delete(apiUrl(`/oss/delete`), {
      params: { fileName, fileType },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (error) {
    console.error("Error deleting picture:", error);
    throw error;
  }
};

export const getConversationUploadUrl = async (fileName, conversationId, contentType = "image/jpeg") => {
  try {
    const normalizedFileName = normalizeFileName(fileName);
    const response = await axios.get(
      apiUrl(`/oss/conversations/presigned-upload-url`),
      { params: { fileName: normalizedFileName, conversationId, contentType } }
    );
    const presignedUrl = String(response.data || "").trim();

    try {
      const decodedPath = decodeURIComponent(new URL(presignedUrl).pathname);
      if (decodedPath.includes("/ ")) {
        throw new Error(`Backend signed an invalid object key: ${decodedPath}`);
      }
    } catch (validationError) {
      if (validationError instanceof Error && validationError.message.includes("Backend signed")) {
        throw validationError;
      }
      // Ignore URL parsing errors and return original URL.
    }

    return presignedUrl;
  } catch (error) {
    console.error("Error fetching conversation upload URL:", error);
    throw error;
  }
};

export const getConversationDownloadUrl = async (fileName, conversationId) => {
  try {
    const token = await getAuthToken();
    const response = await axios.get(
      apiUrl(`/oss/conversations/presigned-download-url`),
      {
        params: { fileName, conversationId },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching conversation download URL:", error);
    return null;
  }
};
