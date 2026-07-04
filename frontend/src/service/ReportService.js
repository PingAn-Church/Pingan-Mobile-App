import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const authHeaders = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");
  return { Authorization: `Bearer ${token}` };
};

/**
 * Report a chat message. A message can only ever be reported once — the
 * backend answers 409 for duplicates; callers can inspect
 * error.response.status to tell "already reported" apart from real failures.
 */
export const reportMessage = async (messageId) => {
  const headers = await authHeaders();
  const response = await axios.post(apiUrl(`/api/reports`), { messageId }, { headers });
  return response.data;
};

/** Admin: paged report queue. status: PENDING | RESOLVED. */
export const getReports = async ({ status, page = 0, size = 20, from, to } = {}) => {
  const headers = await authHeaders();
  const params = { page, size };
  if (status) params.status = status;
  if (from) params.from = from;
  if (to) params.to = to;

  const response = await axios.get(apiUrl(`/api/reports`), { params, headers });
  return response.data;
};

/** Admin: resolve a pending report. action: DEACTIVATE_USER | DELETE_MESSAGE | NO_PROBLEM */
export const resolveReport = async (reportId, action) => {
  const headers = await authHeaders();
  const response = await axios.post(
    apiUrl(`/api/reports/${reportId}/resolve`),
    { action },
    { headers }
  );
  return response.data;
};
