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
    const token = await getAuthToken();
    if (!token) throw new Error("No auth token found");
    const response = await axios.get(apiUrl(`/api/events`), {
      params: {
        status,
        page,
        size,
        sort,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
      headers: { Authorization: `Bearer ${token}` },
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
    const token = await getAuthToken();
    if (!token) throw new Error("No auth token found");
    const response = await axios.get(
      apiUrl(`/api/events/${eventId}`),
      { headers: { Authorization: `Bearer ${token}` } }
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

const authHeaders = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");
  return { Authorization: `Bearer ${token}` };
};

// The viewer's sign-up state for one event, with the event itself inside
// (`status.event`), so a chat share card needs only this one request.
export const getEventRegistration = async (eventId) => {
  const response = await axios.get(apiUrl(`/api/events/${eventId}/registration`), {
    headers: await authHeaders(),
  });
  return response.data;
};

// Register / cancel resolve to { ok, status } rather than throwing when the
// server turns the request down (409: switched off, started or full) — the body
// is still the current state, and `status.closedReason` says which.
const writeRegistration = async (method, eventId) => {
  try {
    const response = await axios({
      method,
      url: apiUrl(`/api/events/${eventId}/registration`),
      headers: await authHeaders(),
    });
    return { ok: true, status: response.data };
  } catch (error) {
    if (error?.response?.status === 409 && error.response.data) {
      return { ok: false, status: error.response.data };
    }
    throw error;
  }
};

export const registerForEvent = (eventId) => writeRegistration("post", eventId);
export const cancelEventRegistration = (eventId) => writeRegistration("delete", eventId);

// Who has registered. 403 when the event's visibility setting hides the list.
export const getEventRegistrants = async (eventId) => {
  const response = await axios.get(apiUrl(`/api/events/${eventId}/registrations`), {
    headers: await authHeaders(),
  });
  return Array.isArray(response.data) ? response.data : [];
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
