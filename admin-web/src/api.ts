import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080'; // Spring Boot server host

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach JWT access token dynamically from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- AUTHENTICATION ---
export const loginUser = async (loginDetails: { email?: string; username?: string; password?: string }) => {
  const deviceId = localStorage.getItem('deviceId') || 'admin-web-console';
  const response = await api.post('/auth/login', loginDetails, {
    params: { deviceId },
  });
  if (response.data?.accessToken) {
    localStorage.setItem('accessToken', response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.data.user || {}));
  }
  return response.data;
};

// --- ANNOUNCEMENTS ---
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

export const updateAnnouncement = async (id: string | number, title: string, imageUrl: string, announcementLink: string) => {
  const response = await api.put(`/api/announcements/${id}`, null, {
    params: { title, imageUrl, announcementLink },
  });
  return response.data;
};

export const deleteAnnouncement = async (id: string | number) => {
  await api.delete(`/api/announcements/${id}`);
};

// --- VIDEOS / LESSONS ---
export const fetchVideos = async (page = 0, size = 20) => {
  const response = await api.get('/api/videos/list', {
    params: { page, size },
  });
  return response.data;
};

export const addVideo = async (videoData: { title: string; videoId: string; videoType: string }) => {
  const response = await api.post('/api/videos/add', videoData);
  return response.data;
};

export const deleteVideo = async (videoId: string) => {
  await api.delete(`/api/videos/delete/${videoId}`);
};

// --- OSS PUBLIC ASSET DOWNLOADS ---
export const getPublicDownloadUrl = async (fileName: string, fileType: string) => {
  const response = await api.get('/oss/public-download-url', {
    params: { fileName, fileType },
  });
  return response.data;
};

export default api;