import apiService from "./apiService";
import type { LearningCourse } from "../types";

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export type ManagedCourse = LearningCourse & { isPublished: boolean };

const mapManaged = (c: any): ManagedCourse => ({
  id: str(c.id),
  title: str(c.title, "Untitled Course"),
  description: str(c.description),
  instructorName: str(c.instructor_name, "Instructor"),
  categoryName: str(c.category_name, "General"),
  categoryColor: c.category_color ?? null,
  durationHours: num(c.duration_hours),
  rating: num(c.rating),
  totalRatings: num(c.total_ratings),
  thumbnailUrl: c.thumbnail_url ?? null,
  tags: Array.isArray(c.tags) ? c.tags : [],
  studentCount: num(c.student_count),
  totalSections: num(c.total_sections),
  totalVideos: num(c.total_videos),
  isPublished: !!c.is_published,
});

export const getAllCoursesAdmin = async (): Promise<ManagedCourse[]> => {
  const res = await apiService.get<any>("/getAllCourse");
  const data = res?.data ?? res ?? [];
  return (Array.isArray(data) ? data : []).map(mapManaged);
};

// Courses
export const createCourse = (body: Record<string, any>) =>
  apiService.post<any>("/createCourse", body);
export const updateCourse = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateCourse/${encodeURIComponent(id)}`, body);
export const deleteCourse = (id: string) =>
  apiService.delete<any>(`/deleteCourse/${encodeURIComponent(id)}`);
export const setCourseOutcomes = (id: string, outcomes: string[]) =>
  apiService.put<any>(`/setCourseOutcomes/${encodeURIComponent(id)}`, { outcomes });

// Sections
export const createSection = (body: Record<string, any>) =>
  apiService.post<any>("/createSection", body);
export const updateSection = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateSection/${encodeURIComponent(id)}`, body);
export const deleteSection = (id: string) =>
  apiService.delete<any>(`/deleteSection/${encodeURIComponent(id)}`);

// Videos
export const createVideo = (body: Record<string, any>) =>
  apiService.post<any>("/createVideo", body);
export const updateVideo = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateVideo/${encodeURIComponent(id)}`, body);
export const deleteVideo = (id: string) =>
  apiService.delete<any>(`/deleteVideo/${encodeURIComponent(id)}`);

// Resources
export const createResource = (body: Record<string, any>) =>
  apiService.post<any>("/createResource", body);
export const updateResource = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateResource/${encodeURIComponent(id)}`, body);
export const deleteResource = (id: string) =>
  apiService.delete<any>(`/deleteResource/${encodeURIComponent(id)}`);

// Categories
export const createCategory = (body: Record<string, any>) =>
  apiService.post<any>("/categoryHandler", body);
export const updateCategory = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/categoryHandler/${encodeURIComponent(id)}`, body);
export const deleteCategory = (id: string) =>
  apiService.delete<any>(`/categoryHandler/${encodeURIComponent(id)}`);
