import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const baseUrl = () => apiUrl(`/api/others`);

// Fetch content by name (e.g., "organisation", "faqs")
export const getOtherContent = async (name) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.get(`${baseUrl()}/${name}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data; // Should return { name: "organisation", content: "..." }
  } catch (error) {
    console.error("Error fetching others content:", error);
    throw error;
  }
};

export const getAllOtherSections = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  const response = await axios.get(`${baseUrl()}/all`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data; // returns an array of { name, content }
};

// Update content by name (admin only)
export const updateOtherContent = async (name, content) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.post(
      `${baseUrl()}/update/${name}`,
      { content },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating others content:", error);
    throw error;
  }
};

export const createOtherSection = async (name, content) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.post(
      `${baseUrl()}/create`,
      { name, content },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating section:", error);
    throw error;
  }
};

export const deleteOtherSection = async (name) => {
  const token = await getAuthToken();
  console.log("token: ", token);
  if (!token) throw new Error("No auth token found");

  try {
    await axios.delete(`${baseUrl()}/delete/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("Error deleting section:", error);
    throw error;
  }
};

export const renameOtherSection = async (oldName, newName) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");

  try {
    const response = await axios.put(
      `${baseUrl()}/rename/${oldName}`,
      { newName },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error("Error renaming section:", error);
    throw error;
  }
};
