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

// Cursor-paginated history. `before` is the smallest message id already loaded
// (null for the newest page). Returns { messages, nextCursor, hasMore }.
export const getChatHistory = async (conversationId, conversationType, before = null, size = 30) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("No token found."); // If no token is found, throw an error
  }

  try {
    const response = await axios.get(apiUrl(`/chat/history`), {
      params: {
        conversationId,
        conversationType,
        size,
        ...(before != null ? { before } : {}),
      },
      headers: {
        Authorization: `Bearer ${token}`, // Send token in Authorization header
      },
    });
    return response.data; // { messages, nextCursor, hasMore }
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

/**
 * One page of a group's members.
 *
 * Ordinary groups already carry their roster in the conversation payload; this
 * exists for the app-level group, whose roster is the whole church and is
 * therefore left out of that payload entirely.
 */
export const getGroupParticipants = async (conversationId, { page = 0, size = 30 } = {}) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  const response = await axios.get(
    apiUrl(`/chat/conversation/${conversationId}/participants`),
    {
      params: { page, size },
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

/** Renames the app-level group. Both languages at once; app admins only. */
export const renameAppGroup = async ({ name, nameZh }) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  const response = await axios.put(
    apiUrl(`/chat/app-group/name`),
    { name, nameZh },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * Switches the in-app assistant on or off for the app-level group.
 *
 * Only that group needs this. Everywhere else the assistant is turned on by adding
 * it to the members and off by removing it — but the church-wide group's roster is
 * derived from who is verified and cannot be hand-edited, so a switch is the only
 * control it can have.
 */
export const setGroupAssistantEnabled = async (conversationId, enabled) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  const response = await axios.put(
    apiUrl(`/chat/conversation/${conversationId}/assistant`),
    { enabled },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
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

/**
 * Marks a whole conversation read, called when the user opens it.
 *
 * The WebSocket read receipts only cover the history page currently loaded, so on
 * their own they leave everything older unread on the server — the badge would
 * clear locally and then reappear on the next refresh. Best-effort: a failure
 * costs a stale badge, never the ability to read the conversation.
 */
export const markConversationRead = async (conversationId, conversationType) => {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const response = await axios.post(apiUrl(`/chat/read`), null, {
      params: { conversationId, conversationType },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data; // { unreadCount }
  } catch (error) {
    console.warn("⚠️ Could not mark the conversation read:", error?.message || error);
    return null;
  }
};

// Per-conversation push-notification mute for the logged-in user.
export const getConversationMuteStatus = async (conversationId, conversationType) => {
  const token = await getAuthToken();

  try {
    const response = await axios.get(apiUrl(`/chat/mute`), {
      params: { conversationId, conversationType },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data; // { muted }
  } catch (error) {
    console.error("Error fetching mute status:", error);
    throw error;
  }
};

export const setConversationMuteStatus = async (conversationId, conversationType, muted) => {
  const token = await getAuthToken();

  try {
    const response = await axios.put(apiUrl(`/chat/mute`), null, {
      params: { conversationId, conversationType, muted },
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data; // { muted }
  } catch (error) {
    console.error("Error updating mute status:", error);
    throw error;
  }
};

// Adds (on) or removes the viewer's emoji on a message. Resolves to the message
// as the viewer should now see it — reactions included, with `mine` filled in.
export const toggleReaction = async (messageId, emoji, on) => {
  const token = await getAuthToken();
  const response = await axios.put(apiUrl(`/chat/reactions`), null, {
    params: { messageId, emoji, on },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// Polls and sign-up sheets. Creating one posts the message that carries it and
// resolves to that message; every other call resolves to the poll's message as
// the caller now sees it (their own choices filled in), which the chat replaces.
export const createPoll = async (conversationType, payload) => {
  const token = await getAuthToken();
  const response = await axios.post(apiUrl(`/chat/polls`), payload, {
    params: { conversationType },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const votePoll = async (pollId, optionIds) => {
  const token = await getAuthToken();
  const response = await axios.put(
    apiUrl(`/chat/polls/${pollId}/votes`),
    { optionIds },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const addPollEntry = async (pollId, note) => {
  const token = await getAuthToken();
  const response = await axios.post(
    apiUrl(`/chat/polls/${pollId}/entries`),
    { note: note || null },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const removePollEntry = async (pollId) => {
  const token = await getAuthToken();
  const response = await axios.delete(apiUrl(`/chat/polls/${pollId}/entries`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const closePoll = async (pollId) => {
  const token = await getAuthToken();
  const response = await axios.post(apiUrl(`/chat/polls/${pollId}/close`), null, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getPollVoters = async (pollId, optionId) => {
  const token = await getAuthToken();
  const response = await axios.get(apiUrl(`/chat/polls/${pollId}/options/${optionId}/voters`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
};

// Group notice: one pinned message per group, admins only. Each resolves to the
// conversation with its `notice` attached (null after unpinning).
export const pinGroupNotice = async (conversationId, messageId) => {
  const token = await getAuthToken();
  const response = await axios.put(apiUrl(`/chat/groups/${conversationId}/notice`), null, {
    params: { messageId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const unpinGroupNotice = async (conversationId) => {
  const token = await getAuthToken();
  const response = await axios.delete(apiUrl(`/chat/groups/${conversationId}/notice`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// { read, total } — how many members have read up to the notice.
export const getGroupNoticeReaders = async (conversationId) => {
  const token = await getAuthToken();
  const response = await axios.get(apiUrl(`/chat/groups/${conversationId}/notice/readers`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// Who reacted to a message with one emoji: [{ id, firstName, lastName, profileImage, bot, displayNameZh }].
export const getReactionUsers = async (messageId, emoji) => {
  const token = await getAuthToken();
  const response = await axios.get(apiUrl(`/chat/reactions/users`), {
    params: { messageId, emoji },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
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
