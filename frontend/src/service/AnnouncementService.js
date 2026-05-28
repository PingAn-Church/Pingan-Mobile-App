import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

export const getAllAnnouncements = async () => {
  try {
    const response = await axios.get(
      apiUrl(`/api/announcements`)
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
      apiUrl(`/api/announcements`),
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
    await axios.delete(apiUrl(`/api/announcements/${id}`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    throw error;
  }
};
