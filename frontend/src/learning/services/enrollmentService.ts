import apiService from "./apiService";
import type { LearningCourse } from "../types";

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface EnrolledCourse extends LearningCourse {
  enrollmentId: string;
  progressPercentage: number;
  isCompleted: boolean;
  totalSections: number;
  completedSections: number;
  isInWishlist: boolean;
}

export interface EnrollmentStats {
  totalEnrollments: number;
  completedCourses: number;
  averageProgress: number;
  totalWatchTimeMinutes: number;
  wishlistCount: number;
}

const mapCourse = (c: any): LearningCourse => ({
  id: str(c.id ?? c.course_id),
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
});

const mapEnrolled = (c: any): EnrolledCourse => ({
  ...mapCourse(c),
  enrollmentId: str(c.enrollment_id),
  progressPercentage: num(c.progress_percentage),
  isCompleted: !!c.is_completed,
  totalSections: num(c.total_sections),
  completedSections: num(c.completed_sections),
  isInWishlist: !!c.is_in_wishlist,
});

export const enroll = async (
  courseId: string
): Promise<{ enrollmentId: string; firstModuleId: string | null }> => {
  const res = await apiService.post<any>("/postUserEnrollment", { courseId });
  const d = res?.data ?? res;
  return { enrollmentId: str(d?.enrollment_id), firstModuleId: d?.firstModuleId ?? null };
};

export const isEnrolled = async (courseId: string): Promise<boolean> => {
  try {
    const res = await apiService.get<any>(`/isEnrolled/${encodeURIComponent(courseId)}`);
    return !!(res?.data?.enrolled ?? res?.enrolled);
  } catch {
    return false;
  }
};

export const getMyCourses = async (): Promise<{
  courses: EnrolledCourse[];
  stats: EnrollmentStats;
}> => {
  const res = await apiService.get<any>("/getUserEnrollment");
  const d = res?.data ?? res;
  const courses = (Array.isArray(d?.enrollments) ? d.enrollments : []).map(mapEnrolled);
  const s = d?.statistics ?? {};
  return {
    courses,
    stats: {
      totalEnrollments: num(s.total_enrollments),
      completedCourses: num(s.completed_courses),
      averageProgress: num(s.average_progress),
      totalWatchTimeMinutes: num(s.total_watch_time_minutes),
      wishlistCount: num(s.wishlist_count),
    },
  };
};

export const markVideoComplete = (videoId: string) =>
  apiService.post<any>("/updateVideoProgress", { videoId, isCompleted: true });

export const markResourceComplete = (resourceId: string) =>
  apiService.post<any>("/updatePDFProgress", { resourceId, isCompleted: true });

export const completeCourse = (courseId: string) =>
  apiService.post<any>("/completeCourse", { courseId });

export const getWishlist = async (): Promise<LearningCourse[]> => {
  const res = await apiService.get<any>("/wishlistHandler");
  const data = res?.data ?? res ?? [];
  return (Array.isArray(data) ? data : []).map(mapCourse);
};

export const addToWishlist = (courseId: string) =>
  apiService.post<any>("/wishlistHandler", { courseId });

export const removeFromWishlist = (courseId: string) =>
  apiService.delete<any>(`/wishlistHandler?courseId=${encodeURIComponent(courseId)}`);
