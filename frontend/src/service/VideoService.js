import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService";

const { IP_ADDR } = Constants.expoConfig?.extra;
const BASE_URL = `http://${IP_ADDR}:8080/api/videos`;

export const addVideo = async (title, videoId, videoType) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      `${BASE_URL}/add`,
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
    const response = await axios.get(`${BASE_URL}/list`);
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
    await axios.delete(`${BASE_URL}/delete/${videoId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    throw error;
  }
};
