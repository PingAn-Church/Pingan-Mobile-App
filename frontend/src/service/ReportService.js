import axios from "axios";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

const authHeaders = async () => {
  const token = await getAuthToken();
  if (!token) throw new Error("No auth token found");
  return { Authorization: `Bearer ${token}` };
};

// Reportable content kinds — must match MessageReport.TYPE_* on the backend.
export const REPORT_TYPE_MESSAGE = "MESSAGE";
export const REPORT_TYPE_THREAD = "THREAD";
export const REPORT_TYPE_THREAD_REPLY = "THREAD_REPLY";
export const REPORT_TYPE_COURSE_REVIEW = "COURSE_REVIEW";

/**
 * Report a piece of user-generated content (chat message, forum thread/reply,
 * course review). Each item can only ever be reported once — the backend
 * answers 409 for duplicates; callers can inspect error.response.status to
 * tell "already reported" apart from real failures. Reporting shadow-hides the
 * content for everyone except its author until an admin resolves the report.
 */
export const reportContent = async (contentType, contentId) => {
  const headers = await authHeaders();
  const response = await axios.post(
    apiUrl(`/api/reports`),
    { contentType, contentId },
    { headers }
  );
  return response.data;
};

/** Report a chat message. */
export const reportMessage = (messageId) => reportContent(REPORT_TYPE_MESSAGE, messageId);

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
