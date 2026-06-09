// Bridges the learning module to the Pingan backend + JWT auth.
// All e-learning endpoints live under `${BACKEND_BASE_URL}/api/fn`.
import { apiUrl } from "../../service/apiConfig";
import { getAuthToken } from "../../service/TokenService";

export const LEARNING_API_PREFIX = "/api/fn";

/** Build a full URL for a learning endpoint path (e.g. "/getAllPublishedCourse"). */
export const learningApiUrl = (path = ""): string => {
  const normalized = String(path).startsWith("/") ? String(path) : `/${path}`;
  return apiUrl(`${LEARNING_API_PREFIX}${normalized}`);
};

/** Returns the current Pingan JWT (refreshing if needed), or null. */
export const getLearningAuthToken = getAuthToken;
