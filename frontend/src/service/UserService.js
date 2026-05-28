import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage"; // Import AsyncStorage
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";


// Fetch user profile data from the backend
// export const fetchUserProfile = async () => {
//   const token = await AsyncStorage.getItem("authToken"); // Get JWT token from AsyncStorage

//   console.log("Fetched token:", token); // Log token to confirm

//   if (!token) {
//     throw new Error("No token found.");
//   }

//   try {
//     // Make API call to fetch user profile
//     const response = await axios.get(apiUrl(`/user/profile`), {
//       headers: {
//         Authorization: `Bearer ${token}`, // Send token in Authorization header
//       },
//     });

//     console.log("User profile fetched:", response.data); // Log response for debugging

//     return response.data; // Return the user data from the API
//   } catch (error) {
//     // Handle any errors (e.g., invalid token, network issues)
//     console.error("Error fetching user profile:", error);
//     throw error; // Re-throw the error so that calling functions can handle it
//   }
// };

// Function to fetch the current logged-in user's profile
export const fetchUserProfile = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/profile`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    throw error;
  }
};

// Fetch user profile data by userId from the backend
export const getUserById = async (userId) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.get(
      apiUrl(`/api/users/${userId}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data; // Return the user data from the API
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error;
  }
};

// Fetch all users excluding the current logged-in user
export const getAllUsers = async () => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.get(apiUrl(`/api/users`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
};

export const startPrivateChat = async (participantIds) => {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    const response = await axios.post(
      apiUrl(`/chat/start`),
      {
        conversationType: "private", // ✅ Fix key name
        participants: participantIds, // ✅ Send only user IDs
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error starting private chat:", error);
    throw error;
  }
};

export const startGroupChat = async (groupDetails) => {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    const response = await axios.post(
      apiUrl(`/chat/start`),
      {
        conversationType: "group", // ✅ Fix key name
        groupName: groupDetails.groupName,
        groupIcon: groupDetails.groupIcon,
        participants: groupDetails.participants, // ✅ Ensure this is an array of IDs
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return { status: response.status, data: response.data };
  } catch (error) {
    console.error("Error starting group chat:", error);
    throw error;
  }
};

export const getOnlineUsers = async () => {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    const response = await axios.get(
      apiUrl(`/api/users/online-users`),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data; // Returns { userId1: "online", userId2: "online", ... }
  } catch (error) {
    console.error("❌ Failed to fetch online users:", error);
    return {};
  }
};

export const getVerifiedUsers = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/verified`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching verified users:", error);
    throw error;
  }
};

export const getAdminUsers = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/admins`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching admin users:", error);
    throw error;
  }
};

export const updateUserVerifiedStatus = async (userId, isVerifiedUser) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      apiUrl(`/api/users/update-verified/${userId}`),
      null,
      {
        params: { isVerifiedUser },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating user verified status:", error);
    throw error;
  }
};

export const updateUserAdminStatus = async (userId, isAdmin) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      apiUrl(`/api/users/update-admin/${userId}`),
      null,
      {
        params: { isAdmin },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating user admin status:", error);
    throw error;
  }
};

export const updateUserProfile = async (userData) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.put(
      apiUrl(`/api/users/profile`),
      userData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
};
