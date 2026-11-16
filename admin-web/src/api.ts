import axios, { AxiosError, AxiosRequestConfig } from 'axios';
 
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// The server address is the ONLY setting that changes between your laptop,
// a preview deployment and production. Set it in admin-web/.env:
//   REACT_APP_API_BASE_URL=http://localhost:8080
// (Restart `npm start` after changing .env.)
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';
 
const STORAGE = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  deviceId: 'deviceId',
  user: 'user',
};
 
// The server stores one refresh token per (account, device). Each browser gets
// its own random device id so the console never logs the phone app out.
const getDeviceId = (): string => {
  let id = localStorage.getItem(STORAGE.deviceId);
  if (!id) {
    const random =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    id = `admin-web-${random}`;
    localStorage.setItem(STORAGE.deviceId, id);
  }
  return id;
};
 
// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------
export interface CurrentUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  admin: boolean;
  instructor: boolean;
}
 
export const getCurrentUser = (): CurrentUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE.user);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
};
 
export const hasSession = (): boolean =>
  Boolean(localStorage.getItem(STORAGE.accessToken) && localStorage.getItem(STORAGE.refreshToken));
 
const clearSession = () => {
  localStorage.removeItem(STORAGE.accessToken);
  localStorage.removeItem(STORAGE.refreshToken);
  localStorage.removeItem(STORAGE.user);
};
 
// App.tsx listens for this to show the "session expired" sign-in box
// WITHOUT throwing away whatever is on screen.
export const SESSION_EXPIRED_EVENT = 'admin-session-expired';
const announceSessionExpired = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
 
// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------
const api = axios.create({ baseURL: API_BASE_URL, timeout: 30000 });
 
api.interceptors.request.use((config) => {
  // Login/refresh/logout must never carry an old token: the server's security
  // filter rejects a bad token before it even looks at the password.
  const isAuthCall = (config.url ?? '').startsWith('/auth/');
  const token = localStorage.getItem(STORAGE.accessToken);
  if (token && !isAuthCall) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});
 
// Single-flight refresh: the server ROTATES the refresh token on every use, so
// if two requests refreshed at the same time, the second would invalidate the
// first and log the user out. Everyone waits on the same promise instead.
let refreshPromise: Promise<string> | null = null;
 
const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem(STORAGE.refreshToken);
  if (!refreshToken) throw new SessionExpiredError();
 
  try {
    // Plain axios (not `api`) so this call never triggers the interceptor itself.
    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh-token`,
      { refreshToken },
      { params: { deviceId: getDeviceId() }, timeout: 15000 }
    );
    localStorage.setItem(STORAGE.accessToken, res.data.accessToken);
    localStorage.setItem(STORAGE.refreshToken, res.data.refreshToken);
    return res.data.accessToken as string;
  } catch (err) {
    const status = (err as AxiosError).response?.status;
    // Only end the session when the server explicitly rejects the refresh token.
    // A network blip must NOT log the user out.
    if (status === 401 || status === 403) {
      clearSession();
      announceSessionExpired();
      throw new SessionExpiredError();
    }
    throw err;
  }
};
 
type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };
 
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    // Never try to "refresh" a login/logout call: a 401 there means wrong
    // email or password, not an expired session.
    const isAuthCall = (original?.url ?? '').startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      original.headers = { ...(original.headers as Record<string, string>), Authorization: `Bearer ${newToken}` };
      return api(original);
    }
    return Promise.reject(error);
  }
);
 
// ---------------------------------------------------------------------------
// Errors -> plain words for volunteers
// ---------------------------------------------------------------------------
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}
 
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof SessionExpiredError) return err.message;
  const axErr = err as AxiosError;
  if (axErr?.isAxiosError) {
    if (!axErr.response) {
      return 'Cannot reach the server. Check your internet connection, or that the server is running.';
    }
    const { status, data } = axErr.response;
    const serverText =
      typeof data === 'string' ? data : (data as { message?: string; error?: string })?.message;
    if (status === 401) return serverText || 'Wrong email or password.';
    if (status === 403) return 'Your account is not allowed to do this.';
    if (status === 404) return 'This item no longer exists. It may have been deleted.';
    if (status >= 500) return 'The server had a problem. Please try again in a moment.';
    return serverText || `Request failed (error ${status}).`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
};
 
// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------
export const loginUser = async (email: string, password: string): Promise<CurrentUser> => {
  clearSession(); // drop any stale tokens (e.g. the old demo token) before signing in
  const res = await api.post('/auth/login', { email, password }, { params: { deviceId: getDeviceId() } });
  const user = res.data.user as CurrentUser;
 
  // The console is only for administrators and instructors. The SERVER still
  // makes every permission decision; this just avoids showing an empty console.
  if (!user?.admin && !user?.instructor) {
    // Sign this device back out so we don't leave a stray session on the server.
    await axios
      .post(`${API_BASE_URL}/auth/logout`, { refreshToken: res.data.refreshToken }, { params: { deviceId: getDeviceId() } })
      .catch(() => undefined);
    throw new Error('This account does not have administrator or instructor access.');
  }
 
  localStorage.setItem(STORAGE.accessToken, res.data.accessToken);
  localStorage.setItem(STORAGE.refreshToken, res.data.refreshToken);
  localStorage.setItem(STORAGE.user, JSON.stringify(user));
  return user;
};
 
export const logoutUser = async (): Promise<void> => {
  const refreshToken = localStorage.getItem(STORAGE.refreshToken);
  try {
    if (refreshToken) {
      await axios.post(`${API_BASE_URL}/auth/logout`, { refreshToken }, { params: { deviceId: getDeviceId() } });
    }
  } catch {
    // Even if the server can't be reached, sign out locally.
  } finally {
    clearSession();
  }
};
 
// ---------------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------------
export const getAllAnnouncements = async () => {
  const response = await api.get('/api/announcements');
  return response.data;
};
 
export const createAnnouncement = async (title: string, imageUrl: string, announcementLink: string) => {
  const response = await api.post('/api/announcements', null, {
    params: { title, imageUrl, announcementLink },
  });
  return response.data;
};
 
export const updateAnnouncement = async (
  id: string | number,
  title: string,
  imageUrl: string,
  announcementLink: string
) => {
  const response = await api.put(`/api/announcements/${id}`, null, {
    params: { title, imageUrl, announcementLink },
  });
  return response.data;
};
 
export const deleteAnnouncement = async (id: string | number) => {
  await api.delete(`/api/announcements/${id}`);
};
 
// ---------------------------------------------------------------------------
// VIDEOS
// ---------------------------------------------------------------------------
export const fetchVideos = async (page = 0, size = 20) => {
  const response = await api.get('/api/videos/list', { params: { page, size } });
  return response.data;
};
 
export const addVideo = async (videoData: { title: string; videoId: string; videoType: string }) => {
  const response = await api.post('/api/videos/add', videoData);
  return response.data;
};
 
export const deleteVideo = async (videoId: string) => {
  await api.delete(`/api/videos/delete/${videoId}`);
};
 
// ---------------------------------------------------------------------------
// OSS PUBLIC ASSET DOWNLOADS
// ---------------------------------------------------------------------------
export const getPublicDownloadUrl = async (fileName: string, fileType: string) => {
  const response = await api.get('/oss/public-download-url', { params: { fileName, fileType } });
  return response.data;
};
 
export default api;
 