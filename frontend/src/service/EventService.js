import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

export const getAllEvents = async ({
  status = "upcoming",
  page = 0,
  size = 20,
  sort = "startAt,asc",
  from,
  to,
} = {}) => {
  try {
    const response = await axios.get(apiUrl(`/api/events`), {
      params: {
        status,
        page,
        size,
        sort,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching events:", error);
    return { success: false, data: [], pagination: { hasMore: false } };
  }
};

// Get details of a specific event
export const getEventById = async (eventId) => {
  try {
    const response = await axios.get(
      apiUrl(`/api/events/${eventId}`)
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching event details:", error);
    return { error: "Failed to fetch event details" };
  }
};

// Check in to an event
export const checkInToEvent = async (eventId, userId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    await axios.post(
      apiUrl(`/api/events/${eventId}/checkin/${userId}`),
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return true;
  } catch (error) {
    console.error("Error checking in:", error);
    return false;
  }
};

export const createEvent = async (eventData) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.post(
      apiUrl(`/api/events`),
      eventData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating event:", error);
    return null;
  }
};

export const updateEvent = async (eventId, updatedData) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.put(
      apiUrl(`/api/events/${eventId}`),
      updatedData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating event:", error);
    throw error;
  }
};

export const deleteEvent = async (eventId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.delete(
      apiUrl(`/api/events/${eventId}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error deleting event:", error);
    throw error;
  }
};
