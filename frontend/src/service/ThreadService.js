// src/service/ThreadService.js

import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const BASE_URL = apiUrl(`/api/threads`);

/**
 * Fetch all threads (requires auth)
 */
export const fetchThreads = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await axios.get(BASE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error fetching threads:", error);
    throw error;
  }
};

/**
 * Create a new thread (requires auth)
 * @param {Object} threadData - { title, content }
 */
export const createThread = async (threadData) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await axios.post(BASE_URL, threadData, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error creating thread:", error);
    throw error;
  }
};

/**
 * Get all replies for a specific thread (requires auth)
 * @param {number} threadId
 */
export const fetchReplies = async (threadId) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await axios.get(`${BASE_URL}/${threadId}/replies`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error fetching replies:", error);
    throw error;
  }
};

/**
 * Add a reply to a specific thread (requires auth)
 * @param {number} threadId
 * @param {Object} replyData - { content }
 */
export const postReply = async (threadId, replyData) => {
  const token = await getAuthToken();
  if (!token) throw new Error("No token found.");

  try {
    const response = await axios.post(
      `${BASE_URL}/${threadId}/replies`,
      replyData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error posting reply:", error);
    throw error;
  }
};

/**
 * Get a single thread by ID (requires auth)
 */
export const fetchThreadById = async (threadId) => {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    try {
      const response = await axios.get(`${BASE_URL}/${threadId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error("Error fetching thread:", error);
      throw error;
    }
  };

export const updateThread = async (threadId, updatedData) => {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    try {
        const response = await axios.put(`${BASE_URL}/${threadId}`, updatedData, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        });
        return response.data;
    } catch (error) {
        console.error("Error updating thread:", error);
        throw error;
    }
};

export const updateReply = async (replyId, updatedContent) => {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    try {
      const response = await axios.put(
        `${BASE_URL}/replies/${replyId}`,
        { content: updatedContent },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error updating reply:", error);
      throw error;
    }
  };

export const deleteThread = async (threadId) => {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    try {
        await axios.delete(`${BASE_URL}/${threadId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        });
    } catch (error) {
        console.error("Error deleting thread:", error);
        throw error;
    }
};

export const deleteReply = async (replyId) => {
    const token = await getAuthToken();
    if (!token) throw new Error("No token found.");

    try {
      await axios.delete(`${BASE_URL}/replies/${replyId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error("Error deleting reply:", error);
      throw error;
    }
  };
