import apiService from "./apiService";

export interface CourseReview {
  id: string;
  rating: number;
  review: string;
  isAnonymous: boolean;
  reviewerName: string;
  reviewerAvatar: string | null;
  createdAt: string | null;
  instructorReply?: string | null;
}

const mapReview = (r: any): CourseReview => ({
  id: String(r.id),
  rating: Number(r.rating) || 0,
  review: String(r.review ?? ""),
  isAnonymous: !!r.isAnonymous,
  reviewerName: String(r.reviewerName ?? "Anonymous"),
  reviewerAvatar: r.reviewerAvatar ?? null,
  createdAt: r.createdAt ?? null,
  instructorReply: r.instructorReply ?? null,
});

export const getMyReview = async (courseId: string): Promise<CourseReview | null> => {
  const res = await apiService.get<any>(`/courseReviewHandler/${encodeURIComponent(courseId)}`);
  const d = res?.data ?? res;
  return d ? mapReview(d) : null;
};

export const getCourseReviews = async (courseId: string): Promise<CourseReview[]> => {
  const res = await apiService.get<any>(`/getCourseReviews/${encodeURIComponent(courseId)}`);
  const data = res?.data ?? res ?? [];
  return (Array.isArray(data) ? data : []).map(mapReview);
};

export interface ReviewPayload {
  rating: number;
  review: string;
  isAnonymous?: boolean;
}

export const postReview = (courseId: string, payload: ReviewPayload) =>
  apiService.post<any>(`/courseReviewHandler/${encodeURIComponent(courseId)}`, payload);

export const updateReview = (courseId: string, payload: ReviewPayload) =>
  apiService.put<any>(`/courseReviewHandler/${encodeURIComponent(courseId)}`, payload);
