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

// Admin-only paged user directory. Returns { success, data, pagination }.
export const getAllUsers = async ({ q = "", page = 0, size = 20, verified, active = true, role } = {}) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.get(apiUrl(`/api/users`), {
      params: {
        q,
        page,
        size,
        ...(verified === undefined ? {} : { verified }),
        ...(active === undefined ? {} : { active }),
        ...(role ? { role } : {}),
      },
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

// Paginated directory search for chat pickers. Returns the backend envelope
// { success, data: [{id, firstName, lastName, profileImage, ...}], pagination }.
// Minimal fields only (no email); empty query returns the first page of users.
export const searchUsers = async (q = "", page = 0, size = 20) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  const response = await axios.get(apiUrl(`/api/users/search`), {
    params: { q, page, size },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
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

export const getVerifiedUsers = async ({ q = "", page = 0, size = 20 } = {}) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/verified`),
      {
        params: { q, page, size },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching verified users:", error);
    throw error;
  }
};

export const getAdminUsers = async ({ q = "", page = 0, size = 20 } = {}) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/admins`),
      {
        params: { q, page, size },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching admin users:", error);
    throw error;
  }
};

export const getInstructorUsers = async ({ q = "", page = 0, size = 20 } = {}) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(
      apiUrl(`/api/users/instructors`),
      {
        params: { q, page, size },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching instructor users:", error);
    throw error;
  }
};

export const updateUserInstructorStatus = async (userId, isInstructor) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      apiUrl(`/api/users/update-instructor/${userId}`),
      null,
      {
        params: { isInstructor },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating user instructor status:", error);
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

// Soft delete: deactivate (active=false) or reactivate (active=true) an account.
export const updateUserActiveStatus = async (userId, active) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.post(
      apiUrl(`/api/users/update-active/${userId}`),
      null,
      {
        params: { active },
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error updating user active status:", error);
    throw error;
  }
};

export const getInactiveUsers = async ({ q = "", page = 0, size = 20 } = {}) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.get(apiUrl(`/api/users/inactive`), {
      params: { q, page, size },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching inactive users:", error);
    throw error;
  }
};

// Hard delete: permanently remove a deactivated user and ALL their associated
// data (chat, quiz attempts, OSS media, etc.). Irreversible; admin-only.
export const deleteUser = async (userId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.delete(apiUrl(`/api/users/${userId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
};

export const deleteOwnAccount = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No authentication token found.");

  try {
    const response = await axios.delete(apiUrl(`/api/users/me`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error("Error deleting own account:", error);
    throw error;
  }
};

/**
 * Tells the backend which language this device is using.
 *
 * Push notification text is composed server-side and shown by the OS, so it
 * never passes through the app's i18n bundle — the server needs to know which
 * language to write in. Best-effort: a signed-out or offline device just keeps
 * its local preference and reports it on the next sign-in.
 */
export const updateMyLanguage = async (language) => {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const response = await axios.put(
      apiUrl(`/api/users/me/language`),
      { language },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.warn("⚠️ Could not report language preference:", error?.message || error);
    return null;
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
