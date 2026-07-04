import apiService from "./apiService";

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface PendingQuestion {
  questionId: string;
  question: string;
  points: number;
  expectedAnswer: string;
  studentAnswer: string;
}

export interface PendingAttempt {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  attemptNumber: number;
  submittedAt: string | null;
  questions: PendingQuestion[];
}

export interface PagedPendingAttempts {
  items: PendingAttempt[];
  pagination: {
    page: number;
    size: number;
    totalCount: number;
    hasMore: boolean;
  };
}

export const getPendingGrading = async ({
  page = 0,
  size = 20,
  courseId,
}: {
  page?: number;
  size?: number;
  courseId?: string;
} = {}): Promise<PagedPendingAttempts> => {
  const params: Record<string, string> = { page: String(page), size: String(size) };
  if (courseId) params.courseId = courseId;
  const res = await apiService.get<any>("/getPendingGrading", params);
  const data = res?.data ?? res ?? [];
  const items = (Array.isArray(data) ? data : []).map((a: any) => ({
    attemptId: str(a.attempt_id),
    quizId: str(a.quiz_id),
    quizTitle: str(a.quiz_title, "Quiz"),
    courseId: str(a.course_id),
    courseTitle: str(a.course_title, "Course"),
    studentName: str(a.student_name, "Learner"),
    attemptNumber: num(a.attempt_number, 1),
    submittedAt: a.submitted_at ?? null,
    questions: (Array.isArray(a.questions) ? a.questions : []).map((q: any) => ({
      questionId: str(q.question_id),
      question: str(q.question),
      points: num(q.points, 1),
      expectedAnswer: str(q.expected_answer),
      studentAnswer: str(q.student_answer),
    })),
  }));
  return {
    items,
    pagination: {
      page: num(res?.pagination?.page),
      size: num(res?.pagination?.size, size),
      totalCount: num(res?.pagination?.totalCount, items.length),
      hasMore: !!res?.pagination?.hasMore,
    },
  };
};

export const gradeShortAnswer = (body: {
  attemptId: string;
  questionId: string;
  pointsAwarded: number;
  feedback?: string;
}) => apiService.post<any>("/gradeShortAnswer", body);
