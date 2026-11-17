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
// IMAGES (cloud storage)
// ---------------------------------------------------------------------------
// Pictures never go through our server. The flow, same as the phone app:
//   1. ask the server for a short-lived signed upload link
//   2. upload the file straight from the browser to cloud storage
//   3. only THEN save the database record that points at it
// so a failed upload can never leave a half-created announcement behind.
export type PublicImageType = 'announcement' | 'course';

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled.');
    this.name = 'UploadCancelledError';
  }
}

const fileNameFromObjectUrl = (objectUrl: string): string => {
  const clean = String(objectUrl || '').split('?')[0].split('#')[0];
  return decodeURIComponent(clean.split('/').pop() || '');
};

/** Turns a stored picture address into one the browser can display, or null. */
export const resolveImageUrl = async (storedUrl: string, fileType: PublicImageType): Promise<string | null> => {
  const fileName = fileNameFromObjectUrl(storedUrl);
  if (!fileName) return null;
  try {
    const res = await api.get('/oss/public-download-url', { params: { fileName, fileType } });
    return typeof res.data === 'string' && res.data ? res.data : null;
  } catch {
    return null;
  }
};

// The server signs upload links for image/jpeg only, so every picture is
// converted to JPEG (and shrunk to at most 1280px, like the phone app does).
const toJpeg = (file: File, maxDimension = 1280, quality = 0.82): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Your browser could not prepare this picture.'));
        return;
      }
      ctx.fillStyle = '#ffffff'; // transparent PNG areas become white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Your browser could not prepare this picture.'));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This picture format cannot be read by the browser. Please use a JPG or PNG file.'));
    };
    img.src = objectUrl;
  });

export const uploadImage = async (
  file: File,
  fileType: PublicImageType,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
): Promise<string> => {
  const jpeg = await toJpeg(file);
  if (options.signal?.aborted) throw new UploadCancelledError();

  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'image';

  let signedUrl: string;
  try {
    const res = await api.get('/oss/presigned-upload-url', { params: { fileName: `${baseName}.jpg`, fileType } });
    signedUrl = String(res.data);
  } catch (err) {
    const status = (err as AxiosError).response?.status;
    if (status === 500) {
      throw new Error(
        'Picture storage is not available on this server. (On a local test server this usually means the cloud storage keys are not set up.)'
      );
    }
    throw err;
  }

  try {
    // Plain axios: this goes to cloud storage, which must NOT receive our login token.
    await axios.put(signedUrl, jpeg, {
      headers: { 'Content-Type': 'image/jpeg' },
      signal: options.signal,
      onUploadProgress: (e) => {
        if (options.onProgress && e.total) options.onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  } catch (err) {
    if (axios.isCancel(err) || options.signal?.aborted) throw new UploadCancelledError();
    if (!(err as AxiosError).response) {
      throw new Error(
        'The upload was blocked or the connection dropped. If this keeps happening, the storage bucket may not allow this website address yet.'
      );
    }
    throw new Error('Cloud storage rejected the upload. The upload link may have expired. Please try again.');
  }

  return signedUrl.split('?')[0];
};

/** Best-effort removal of a picture we uploaded but never used. */
export const deleteOwnUpload = async (objectUrl: string, fileType: PublicImageType): Promise<void> => {
  const fileName = fileNameFromObjectUrl(objectUrl);
  if (!fileName) return;
  try {
    await api.delete('/oss/own-upload', { params: { fileName, fileType } });
  } catch {
    // Not fatal: the server also cleans up unreferenced uploads.
  }
};

// ---------------------------------------------------------------------------
// ANNOUNCEMENTS
// ---------------------------------------------------------------------------
export interface Announcement {
  id: number;
  title: string;
  imageUrl: string;
  announcementLink?: string | null;
  createdAt?: string | number | null;
}

/** The server returns the 20 newest announcements, newest first. */
export const getAllAnnouncements = async (): Promise<Announcement[]> => {
  const response = await api.get('/api/announcements');
  return Array.isArray(response.data) ? response.data : [];
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
// MEMBERS
// ---------------------------------------------------------------------------
export interface Member {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  verifiedUser: boolean;
  admin: boolean;
  instructor: boolean;
  language?: string | null;
}

export interface MemberPage {
  members: Member[];
  totalCount: number;
  hasMore: boolean;
}

export const MEMBER_PAGE_SIZE = 50; // the server's maximum page size

/** Admin-only member directory. `verified: false` = people waiting for approval. */
export const listMembers = async (opts: {
  q?: string;
  verified?: boolean;
  active?: boolean;
  role?: 'admin' | 'instructor';
  page?: number;
}): Promise<MemberPage> => {
  const res = await api.get('/api/users', {
    params: {
      q: opts.q ?? '',
      verified: opts.verified,
      active: opts.active ?? true,
      role: opts.role,
      page: opts.page ?? 0,
      size: MEMBER_PAGE_SIZE,
    },
  });
  return {
    members: Array.isArray(res.data?.data) ? res.data.data : [],
    totalCount: Number(res.data?.pagination?.totalCount ?? 0),
    hasMore: Boolean(res.data?.pagination?.hasMore),
  };
};

/** Approve (true) or un-approve (false) a member. Safe to repeat. */
export const setMemberVerified = async (id: number, verified: boolean): Promise<void> => {
  await api.post(`/api/users/update-verified/${id}`, null, { params: { isVerifiedUser: verified } });
};

/** Clears this admin's "new members" badge (the phone app does this too). */
export const markNewMembersSeen = async (): Promise<void> => {
  await api.post('/api/users/new-members/seen').catch(() => undefined);
};

// ---------------------------------------------------------------------------
// COURSES (authoring)
// ---------------------------------------------------------------------------
// The learning endpoints answer with { success, message, data, pagination }.
// Admins see every course; instructors only see their own (server-enforced).
export interface Category {
  id: string;
  name: string;
  color?: string | null;
}

export interface CourseSummary {
  id: string;
  title: string;
  description?: string | null;
  instructor_id?: string | null;
  instructor_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  duration_hours?: number | null;
  thumbnail_url?: string | null;
  tags?: string[];
  is_published: boolean;
  student_count?: number;
  total_sections?: number;
  total_videos?: number;
  total_quizzes?: number;
  updated_at?: string | null;
}

export interface VideoLesson {
  id: string;
  type: 'video';
  section_id: string | null;
  title: string;
  description?: string | null;
  video_url?: string | null;
  duration_seconds?: number | null;
  is_preview?: boolean;
  order_index: number;
}

export interface ResourceLesson {
  id: string;
  type: 'resource';
  section_id: string | null;
  title: string;
  description?: string | null;
  resource_url?: string | null;
  resource_type?: string | null;
  is_downloadable?: boolean;
  is_preview?: boolean;
  order_index: number;
}

export interface QuizLesson {
  id: string;
  type: 'quiz';
  section_id: string | null;
  title: string;
  description?: string | null;
  passing_score?: number | null;
  max_attempts?: number | null;
  order_index: number;
}

export interface CourseSection {
  id: string;
  title: string;
  description?: string | null;
  order_index: number;
  videos: VideoLesson[];
  resources: ResourceLesson[];
  quizzes: QuizLesson[];
}

export interface CourseDetail extends CourseSummary {
  outcomes: string[];
  modules: CourseSection[];
}

export interface CoursePage {
  courses: CourseSummary[];
  totalCount: number;
  hasMore: boolean;
}

const LEARNING = '/api/fn';

export const listCourses = async (opts: { q?: string; published?: boolean; page?: number } = {}): Promise<CoursePage> => {
  const res = await api.get(`${LEARNING}/getAllCourse`, {
    params: { q: opts.q ?? '', published: opts.published, page: opts.page ?? 0, size: 20 },
  });
  return {
    courses: Array.isArray(res.data?.data) ? res.data.data : [],
    totalCount: Number(res.data?.pagination?.totalCount ?? 0),
    hasMore: Boolean(res.data?.pagination?.hasMore),
  };
};

/** Full course with sections and lessons (drafts included for instructors). */
export const getCourse = async (courseId: string): Promise<CourseDetail> => {
  const res = await api.get(`${LEARNING}/getModuleDetail/${encodeURIComponent(courseId)}`);
  const d = res.data?.data ?? {};
  return { ...d, outcomes: d.outcomes ?? [], modules: d.modules ?? [], tags: d.tags ?? [] } as CourseDetail;
};

export const listCategories = async (): Promise<Category[]> => {
  const res = await api.get(`${LEARNING}/categoryHandler`);
  return Array.isArray(res.data?.data) ? res.data.data : [];
};

export interface CourseInput {
  title: string;
  description: string;
  categoryName: string;
  durationHours: number;
  thumbnailUrl: string | null;
  tags: string[];
  isPublished: boolean;
}

export const createCourse = async (input: CourseInput): Promise<CourseSummary> => {
  const res = await api.post(`${LEARNING}/createCourse`, input);
  return res.data?.data;
};

export const updateCourse = async (courseId: string, input: Partial<CourseInput>): Promise<CourseSummary> => {
  const res = await api.put(`${LEARNING}/updateCourse/${encodeURIComponent(courseId)}`, input);
  return res.data?.data;
};

export const deleteCourse = async (courseId: string): Promise<void> => {
  await api.delete(`${LEARNING}/deleteCourse/${encodeURIComponent(courseId)}`);
};

export const setCourseOutcomes = async (courseId: string, outcomes: string[]): Promise<void> => {
  await api.put(`${LEARNING}/setCourseOutcomes/${encodeURIComponent(courseId)}`, { outcomes });
};

export const createSection = async (body: { courseId: string; title: string; description?: string; orderIndex?: number }) => {
  const res = await api.post(`${LEARNING}/createSection`, body);
  return res.data?.data;
};

export const updateSection = async (id: string, body: { title?: string; description?: string; orderIndex?: number }) => {
  const res = await api.put(`${LEARNING}/updateSection/${encodeURIComponent(id)}`, body);
  return res.data?.data;
};

export const deleteSection = async (id: string): Promise<void> => {
  await api.delete(`${LEARNING}/deleteSection/${encodeURIComponent(id)}`);
};

export interface VideoInput {
  courseId: string;
  sectionId: string;
  title: string;
  description?: string;
  videoUrl: string;
  durationSeconds: number;
  isPreview: boolean;
  orderIndex?: number;
}

export const createCourseVideo = async (body: VideoInput) => (await api.post(`${LEARNING}/createVideo`, body)).data?.data;
export const updateCourseVideo = async (id: string, body: Partial<VideoInput>) =>
  (await api.put(`${LEARNING}/updateVideo/${encodeURIComponent(id)}`, body)).data?.data;
export const deleteCourseVideo = async (id: string) => {
  await api.delete(`${LEARNING}/deleteVideo/${encodeURIComponent(id)}`);
};

export interface ResourceInput {
  courseId: string;
  sectionId: string;
  title: string;
  description?: string;
  resourceUrl: string;
  resourceType: string;
  isDownloadable: boolean;
  isPreview: boolean;
  orderIndex?: number;
}

export const createCourseResource = async (body: ResourceInput) => (await api.post(`${LEARNING}/createResource`, body)).data?.data;
export const updateCourseResource = async (id: string, body: Partial<ResourceInput>) =>
  (await api.put(`${LEARNING}/updateResource/${encodeURIComponent(id)}`, body)).data?.data;
export const deleteCourseResource = async (id: string) => {
  await api.delete(`${LEARNING}/deleteResource/${encodeURIComponent(id)}`);
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