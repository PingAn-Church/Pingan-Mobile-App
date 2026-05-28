import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const baseUrl = () => apiUrl(`/api/videos`);

export const addVideo = async (title, videoId, videoType) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      `${baseUrl()}/add`,
      {
        title,
        videoId,
        videoType,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error adding video:", error);
    throw error;
  }
};

export const fetchVideos = async () => {
  try {
    const response = await axios.get(`${baseUrl()}/list`);
    return response.data;
  } catch (error) {
    console.error("Error fetching videos:", error);
    throw error;
  }
};

export const deleteVideo = async (videoId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    await axios.delete(`${baseUrl()}/delete/${videoId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    throw error;
  }
};
