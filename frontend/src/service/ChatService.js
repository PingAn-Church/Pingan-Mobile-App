import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";


// Fetch conversations of the logged-in user
export const getConversations = async (userId) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found."); // If no token is found, throw an error
  }

  try {
    // Make API call to fetch conversations for the user
    const response = await axios.get(
      apiUrl(`/chat/conversations`),
      {
        params: { userId }, // Pass userId as query parameter
        headers: {
          Authorization: `Bearer ${token}`, // Send token in Authorization header
        },
      }
    );

    return response.data; // Return the list of conversations from the response
  } catch (error) {
    // Handle errors, such as network issues or invalid token
    console.error("Error fetching conversations:", error);
    throw error; // Re-throw the error to be handled by the calling function
  }
};

// Fetch conversation details by conversationId
export const getConversationById = async (conversationId) => {
  const token = await getAuthToken(); // Get JWT token from AsyncStorage

  if (!token) {
    throw new Error("No token found."); // If no token is found, throw an error
  }

  try {
    const response = await axios.get(
      apiUrl(`/chat/conversation/${conversationId}`),
      {
        headers: {
          Authorization: `Bearer ${token}`, // Send token in Authorization header
        },
      }
    );
    return response.data; // Return the conversation details
  } catch (error) {
    console.error("Error fetching conversation details:", error);
    throw error;
  }
};

export const getChatHistory = async (conversationId, conversationType) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found."); // If no token is found, throw an error
  }

  try {
    const response = await axios.get(apiUrl(`/chat/history`), {
      params: { conversationId, conversationType },
      headers: {
        Authorization: `Bearer ${token}`, // Send token in Authorization header
      },
    });
    return response.data; // Return the list of messages for the conversation
  } catch (error) {
    console.error("Error fetching chat history:", error);
    throw error;
  }
};

export const sendMessageToDatabase = async (chatMessage, conversationType, retryCount = 0) => {
  const token = await getAuthToken();

  try {
    const response = await fetch(
      apiUrl(`/chat/send?conversationType=${conversationType}`), // ✅ Pass `conversationType` as a query parameter
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(chatMessage), // ✅ Only send `chatMessage` in the body
      }
    );

    // Check if response is ok
    if (!response.ok) {
      // If 403 and haven't retried yet, refresh token and retry
      if (response.status === 403 && retryCount === 0) {
        console.log("🔄 Got 403, refreshing token and retrying...");
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay before retry
        return sendMessageToDatabase(chatMessage, conversationType, 1);
      }

      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    // Check if response has content before parsing JSON
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      console.log("✅ Message sent successfully");
      return { success: true };
    }

    return JSON.parse(text);
  } catch (error) {
    console.error("Error sending message to database:", error);
    throw error;
  }
};

export const deleteMessageFromDatabase = async (messageId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await fetch(
      apiUrl(`/chat/deleteMessage?messageId=${messageId}`),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) throw new Error("Failed to delete message.");

    return await response.json(); // ✅ Return deleted message details
  } catch (error) {
    console.error("Error deleting message:", error);
    throw error;
  }
};


export const editMessageInDatabase = async (messageId, newContent, conversationType) => {
  const token = await getAuthToken();

  try {
    const response = await fetch(
      apiUrl(`/chat/editMessage?messageId=${messageId}&conversationType=${conversationType}`), // ✅ Pass `conversationType` in the request parameters
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newContent }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update message.");
    }

    return await response.json();
  } catch (error) {
    console.error("Error editing message:", error);
    throw error;
  }
};

export const addParticipantToGroup = async (conversationId, userId) => {
  const token = await getAuthToken(); // Retrieve the authentication token

  if (!token) {
    throw new Error("No token found."); // Prevent API call if no token exists
  }

  try {
    // ✅ Make the API request to add a participant
    const response = await axios.post(
      apiUrl(`/chat/addParticipant`),
      null, // No request body needed
      {
        params: { conversationId, userId }, // Send conversation and user ID as query params
        headers: {
          Authorization: `Bearer ${token}`, // Attach token in headers
        },
      }
    );

    return response.data; // Return API response
  } catch (error) {
    console.error("❌ Error adding participant to group:", error);
    throw error; // Ensure error is propagated for handling
  }
};

export const removeParticipantFromGroup = async (conversationId, userId) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.delete(apiUrl(`/chat/removeParticipant`), {
      params: { conversationId, userId },
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    console.error("❌ Error removing participant:", error);
    throw error;
  }
};


export const addAdminToGroup = async (conversationId, userId) => {
  // if (conversationType === "private") {
  //   throw new Error("Cannot add admins to private conversations.");
  // }

  const token = await getAuthToken();

  try {
    const response = await axios.post(
      apiUrl(`/chat/addAdmin`),
      null,
      {
        params: { conversationId, userId },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error adding admin:", error);
    throw error;
  }
};

export const removeAdminFromGroup = async (conversationId, userId, conversationType) => {
  if (conversationType === "private") {
    throw new Error("Cannot remove admins from private conversations.");
  }

  const token = await getAuthToken();

  try {
    await axios.delete(apiUrl(`/chat/removeAdmin`), {
      params: { conversationId, userId },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error("Error removing admin:", error);
    throw error;
  }
};

export const leaveGroup = async (conversationId) => {
  const token = await getAuthToken(); // Get the token from AsyncStorage or wherever it's stored

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.delete(
      apiUrl(`/chat/leaveGroup`),
      {
        params: { conversationId },
        headers: { Authorization: `Bearer ${token}` }, // Send token in Authorization header
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error leaving group:", error);
    throw error;
  }
};

export const updateGroupIcon = async (conversationId, groupIcon) => {
  const token = await getAuthToken();

  try {
    const response = await axios.put(
      apiUrl(`/chat/updateGroupIcon`),
      null,
      {
        params: { conversationId, groupIcon },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error updating group icon:", error);
    throw error;
  }
};

export const deleteConversationFromDatabase = async (conversationId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await axios.delete(
      apiUrl(`/chat/conversation/${conversationId}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error deleting conversation:", error);
    throw error;
  }
};
