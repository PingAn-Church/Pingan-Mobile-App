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

export interface PagedReviews {
  items: CourseReview[];
  pagination: {
    page: number;
    size: number;
    totalCount: number;
    hasMore: boolean;
  };
}

const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

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
  // "No review yet" comes back as {success, data: null}. `res?.data ?? res`
  // would fall through to the truthy envelope itself and fabricate a phantom
  // review (flipping the form into update mode), so only unwrap `data` when
  // the key exists and insist on a real review id.
  const d = res && typeof res === "object" && "data" in res ? res.data : res;
  return d && d.id != null ? mapReview(d) : null;
};

export const getCourseReviews = async (
  courseId: string,
  { page = 0, size = 20 }: { page?: number; size?: number } = {}
): Promise<PagedReviews> => {
  const res = await apiService.get<any>(`/getCourseReviews/${encodeURIComponent(courseId)}`, {
    page: String(page),
    size: String(size),
  });
  const items = (Array.isArray(res?.data) ? res.data : []).map(mapReview);
  return {
    items,
    pagination: {
      page: num(res?.pagination?.page, page),
      size: num(res?.pagination?.size, size),
      totalCount: num(res?.pagination?.totalCount, items.length),
      hasMore: !!res?.pagination?.hasMore,
    },
  };
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
