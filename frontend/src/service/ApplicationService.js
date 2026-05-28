import axios from "axios";
import { apiUrl } from "./apiConfig";

export const getAllApplications = async () => {
  try {
    const response = await axios.get(apiUrl(`/api/applications`));
    return response.data;
  } catch (error) {
    console.error("Error fetching applications:", error);
    return [];
  }
};

export const createApplication = async (applicationData) => {
  try {
    const response = await axios.post(
      apiUrl(`/api/applications`),
      applicationData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating application:", error);
    return null;
  }
};
