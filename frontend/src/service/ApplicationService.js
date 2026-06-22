import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

export const getAllApplications = async (page = 0, size = 20) => {
  try {
    const token = await getAuthToken();
    const response = await axios.get(apiUrl(`/api/applications`), {
      params: { page, size },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data; // { success, data, pagination }
  } catch (error) {
    console.error("Error fetching applications:", error);
    return { data: [], pagination: { hasMore: false } };
  }
};

export const createApplication = async (applicationData) => {
  try {
    const token = await getAuthToken();
    const response = await axios.post(
      apiUrl(`/api/applications`),
      applicationData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating application:", error);
    return null;
  }
};
