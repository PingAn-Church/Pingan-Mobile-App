// Domain types for the e-learning module (camelCase; services map from the
// snake_case the Spring `/api/fn` endpoints return).

export interface LearningCategory {
  id: string;
  name: string;
  color?: string | null;
  courseCount: number;
}

export interface LearningCourse {
  id: string;
  title: string;
  description: string;
  instructorName: string;
  categoryName: string;
  categoryColor?: string | null;
  durationHours: number;
  rating: number;
  totalRatings: number;
  thumbnailUrl?: string | null;
  tags: string[];
  studentCount: number;
  totalSections: number;
  totalVideos: number;
  isPublished?: boolean;
}

export type LessonType = "video" | "resource" | "quiz";

export interface LearningLesson {
  id: string;
  type: LessonType;
  title: string;
  description?: string;
  durationSeconds?: number;
  videoUrl?: string;
  resourceUrl?: string;
  resourceType?: string;
  isPreview?: boolean;
  orderIndex?: number;
}

export interface LearningModule {
  id: string;
  title: string;
  description?: string;
  lessons: LearningLesson[];
}

export interface LearningCourseDetail extends LearningCourse {
  outcomes: string[];
  modules: LearningModule[];
}
