import axios from "axios";
import Constants from "expo-constants";

const { IP_ADDR } = Constants.expoConfig?.extra;

export const getAllApplications = async () => {
  try {
    const response = await axios.get(`http://${IP_ADDR}:8080/api/applications`);
    return response.data;
  } catch (error) {
    console.error("Error fetching applications:", error);
    return [];
  }
};

export const createApplication = async (applicationData) => {
  try {
    const response = await axios.post(
      `http://${IP_ADDR}:8080/api/applications`,
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
