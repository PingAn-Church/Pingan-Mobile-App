import axios from "axios";
import { apiUrl } from "./apiConfig";

export const getPresignedUploadUrl = async (fileName, fileType) => {
  try {
    const response = await axios.get(apiUrl(`/s3/presigned-upload-url`), {
      params: { fileName, fileType },  // Send both file name and file type
    });
    return response.data;  // Return the pre-signed URL
  } catch (error) {
    console.error("Error fetching pre-signed URL:", error);
    throw error;
  }
};

export const getPresignedDownloadUrl = async (fileName, fileType) => {
  try {
    const response = await axios.get(apiUrl(`/s3/presigned-download-url`), {
      params: { fileName, fileType },  // Send both file name and file type
    });
    return response.data;  // Return the pre-signed URL for viewing
  } catch (error) {
    console.error("Error fetching pre-signed URL for viewing image:", error);
    throw error;
  }
};
