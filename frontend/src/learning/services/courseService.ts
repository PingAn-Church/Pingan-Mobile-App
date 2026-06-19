import apiService from "./apiService";
import {
  LearningCategory,
  LearningCourse,
  LearningCourseDetail,
  LearningLesson,
  LearningModule,
} from "../types";

const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v: any, d = ""): string => (v == null ? d : String(v));

const mapCourse = (c: any): LearningCourse => ({
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

const mapLesson = (l: any): LearningLesson => ({
  id: str(l.id),
  type: l.type === "resource" ? "resource" : l.type === "quiz" ? "quiz" : "video",
  title: str(l.title),
  description: str(l.description),
  durationSeconds: num(l.duration_seconds),
  videoUrl: l.video_url ?? undefined,
  resourceUrl: l.resource_url ?? undefined,
  resourceType: l.resource_type ?? undefined,
  isPreview: !!l.is_preview,
  orderIndex: num(l.order_index),
  isCompleted: !!l.is_completed,
  quizAttempted: !!l.attempted,
  quizScore: num(l.score),
  quizPassed: !!l.is_passed,
  gradesReleased: l.grades_released === undefined ? true : !!l.grades_released,
});

export const getCategories = async (): Promise<LearningCategory[]> => {
  const res = await apiService.get<any>("/categoryHandler");
  const data = res?.data ?? res ?? [];
  return (Array.isArray(data) ? data : []).map((c: any) => ({
    id: str(c.id),
    name: str(c.name),
    color: c.color ?? null,
    courseCount: num(c.course_count),
  }));
};

export interface CoursesPage {
  courses: LearningCourse[];
  total: number;
  hasMore: boolean;
}

export const getPublishedCourses = async (params: {
  category?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
} = {}): Promise<CoursesPage> => {
  const query: Record<string, string> = {
    limit: String(params.limit ?? 24),
    offset: String(params.offset ?? 0),
    sortBy: params.sortBy ?? "updated_at",
    sortOrder: params.sortOrder ?? "desc",
  };
  if (params.category) query.category = params.category;

  const res = await apiService.get<any>("/getAllPublishedCourse", query);
  const arr = Array.isArray(res?.data)
    ? res.data
    : res?.data?.courses ?? res?.courses ?? [];
  return {
    courses: (arr || []).map(mapCourse),
    total: num(res?.pagination?.totalCount, arr?.length ?? 0),
    hasMore: !!res?.pagination?.hasMore,
  };
};

export const getCourseDetail = async (
  courseId: string
): Promise<LearningCourseDetail> => {
  const res = await apiService.get<any>(
    `/getModuleDetail/${encodeURIComponent(courseId)}`
  );
  const d = res?.data ?? res;
  const base = mapCourse(d);
  const modules: LearningModule[] = (Array.isArray(d?.modules) ? d.modules : []).map(
    (m: any) => ({
      id: str(m.id),
      title: str(m.title),
      description: str(m.description),
      lessons: (Array.isArray(m.lessons) ? m.lessons : []).map(mapLesson),
    })
  );
  return {
    ...base,
    outcomes: Array.isArray(d?.outcomes) ? d.outcomes : [],
    modules,
    isInWishlist: !!d?.is_in_wishlist,
  };
};
