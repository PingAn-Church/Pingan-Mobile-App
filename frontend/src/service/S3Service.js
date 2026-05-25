import axios from "axios";
import Constants from "expo-constants";

const { IP_ADDR } = Constants.expoConfig?.extra;

export const getPresignedUploadUrl = async (fileName, fileType) => {
  try {
    const response = await axios.get(`http://${IP_ADDR}:8080/s3/presigned-upload-url`, {
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
    const response = await axios.get(`http://${IP_ADDR}:8080/s3/presigned-download-url`, {
      params: { fileName, fileType },  // Send both file name and file type
    });
    return response.data;  // Return the pre-signed URL for viewing
  } catch (error) {
    console.error("Error fetching pre-signed URL for viewing image:", error);
    throw error;
  }
};