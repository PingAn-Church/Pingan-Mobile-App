import axios from "axios";
import Constants from "expo-constants";
import { getAuthToken } from "./TokenService";

const { IP_ADDR } = Constants.expoConfig?.extra;

export const getAllAnnouncements = async () => {
  try {
    const response = await axios.get(
      `http://${IP_ADDR}:8080/api/announcements`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching announcements:", error);
    throw error;
  }
};

export const createAnnouncement = async (title, imageUrl, announcementLink) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      `http://${IP_ADDR}:8080/api/announcements`,
      null,
      {
        params: { title, imageUrl, announcementLink},
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating announcement:", error);
    throw error;
  }
};

export const deleteAnnouncement = async (id) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    await axios.delete(`http://${IP_ADDR}:8080/api/announcements/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    throw error;
  }
};
