import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const authHeaders = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");
  return { Authorization: `Bearer ${token}` };
};

/**
 * User blocking. A block is directional; private messaging is disabled while a
 * block exists in EITHER direction, so unblocking someone is not enough if
 * they still block you. Status shape: { blockedByMe, blockedMe, canMessage }.
 */
export const blockUser = async (userId) => {
  const headers = await authHeaders();
  const response = await axios.post(apiUrl(`/api/blocks`), { userId }, { headers });
  return response.data;
};

export const unblockUser = async (userId) => {
  const headers = await authHeaders();
  const response = await axios.delete(apiUrl(`/api/blocks/${userId}`), { headers });
  return response.data;
};

export const getBlockStatus = async (userId) => {
  const headers = await authHeaders();
  const response = await axios.get(apiUrl(`/api/blocks/status`), {
    params: { userId },
    headers,
  });
  return response.data;
};

/** IDs of every user I've blocked. */
export const getBlockedIds = async () => {
  const headers = await authHeaders();
  const response = await axios.get(apiUrl(`/api/blocks`), { headers });
  return Array.isArray(response.data) ? response.data : [];
};
