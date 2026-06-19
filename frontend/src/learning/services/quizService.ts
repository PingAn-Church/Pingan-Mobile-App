import apiService from "./apiService";

export type QuestionType =
  | "multiple-choice"
  | "multiple-correct"
  | "true-false"
  | "short-answer"
  | "matching";

export interface QuizQuestion {
  id: string;
  question: string;
  questionType: QuestionType;
  options: string[];
  points: number;
  imageUrl?: string | null;
  // Matching questions only: prompts (left, in order) and shuffled choices (right).
  matchingLeft?: string[];
  matchingRight?: string[];
}

export interface QuizDetail {
  id: string;
  title: string;
  description: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  attemptsRemaining: number | null;
  questions: QuizQuestion[];
}

export interface QuizResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  isPassed: boolean;
  /** True when short answers are held for instructor review (score is provisional). */
  pendingReview: boolean;
  pendingCount: number;
  attemptNumber: number;
  attemptsRemaining: number | null;
}

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const getQuizDetail = async (quizId: string): Promise<QuizDetail> => {
  const res = await apiService.get<any>(`/getQuizDetail/${encodeURIComponent(quizId)}`);
  const d = res?.data ?? res;
  return {
    id: str(d.id),
    title: str(d.title, "Quiz"),
    description: str(d.description),
    passingScore: num(d.passing_score, 70),
    timeLimitMinutes: d.time_limit_minutes ?? null,
    maxAttempts: d.max_attempts ?? null,
    attemptsRemaining: d.attempts_remaining ?? null,
    questions: (Array.isArray(d.questions) ? d.questions : []).map((q: any) => ({
      id: str(q.id),
      question: str(q.question),
      questionType: (q.question_type as QuestionType) || "multiple-choice",
      options: Array.isArray(q.options) ? q.options.map((o: any) => String(o)) : [],
      points: num(q.points, 1),
      imageUrl: q.image_url ?? null,
      matchingLeft: Array.isArray(q.matching_left) ? q.matching_left.map((o: any) => String(o)) : undefined,
      matchingRight: Array.isArray(q.matching_right) ? q.matching_right.map((o: any) => String(o)) : undefined,
    })),
  };
};

export interface SubmittedAnswer {
  questionId: string;
  answer: any;
}

export const submitQuiz = async (
  quizId: string,
  answers: SubmittedAnswer[],
  timeTakenMinutes?: number
): Promise<QuizResult> => {
  const res = await apiService.post<any>(`/submitQuiz/${encodeURIComponent(quizId)}`, {
    answers,
    timeTakenMinutes,
  });
  const d = res?.data ?? res;
  return {
    score: num(d.score),
    totalQuestions: num(d.totalQuestions),
    correctAnswers: num(d.correctAnswers),
    isPassed: !!d.isPassed,
    pendingReview: !!d.pendingReview,
    pendingCount: num(d.pendingCount),
    attemptNumber: num(d.attemptNumber, 1),
    attemptsRemaining: d.attemptsRemaining ?? null,
  };
};

// Per-question review of the user's latest attempt. `isCorrect` is null while a
// short answer awaits the instructor's review.
export interface QuizAnswerReview {
  id: string;
  question: string;
  questionType: QuestionType;
  yourAnswer: any;
  correctAnswer: any;
  isCorrect: boolean | null;
  pendingReview: boolean;
  pointsAwarded?: number;
  maxPoints?: number;
  feedback?: string | null;
  explanation?: string | null;
}

export interface QuizResultDetail {
  /** False when the user has no attempt on record yet. */
  attempted: boolean;
  score: number;
  isPassed: boolean;
  attemptNumber: number;
  totalQuestions: number;
  correctAnswers: number;
  /** False while short answers are still awaiting the instructor's review. */
  gradesReleased: boolean;
  questions: QuizAnswerReview[];
}

export const getQuizResults = async (quizId: string): Promise<QuizResultDetail> => {
  const res = await apiService.get<any>(`/getQuizResults/${encodeURIComponent(quizId)}`);
  // The envelope is { success, data }, and data is null when there's no attempt.
  const d = res?.data;
  if (!d) {
    return {
      attempted: false,
      score: 0,
      isPassed: false,
      attemptNumber: 0,
      totalQuestions: 0,
      correctAnswers: 0,
      gradesReleased: true,
      questions: [],
    };
  }
  return {
    attempted: true,
    score: num(d.score),
    isPassed: !!d.isPassed,
    attemptNumber: num(d.attemptNumber),
    totalQuestions: num(d.totalQuestions),
    correctAnswers: num(d.correctAnswers),
    gradesReleased: d.gradesReleased === undefined ? true : !!d.gradesReleased,
    questions: (Array.isArray(d.questions) ? d.questions : []).map((q: any) => ({
      id: str(q.id),
      question: str(q.question),
      questionType: (q.question_type as QuestionType) || "multiple-choice",
      yourAnswer: q.your_answer ?? null,
      correctAnswer: q.correct_answer ?? null,
      isCorrect: q.is_correct === undefined ? null : q.is_correct,
      pendingReview: !!q.pending_review,
      pointsAwarded: q.points_awarded != null ? num(q.points_awarded) : undefined,
      maxPoints: q.max_points != null ? num(q.max_points) : undefined,
      feedback: q.feedback ?? null,
      explanation: q.explanation ?? null,
    })),
  };
};

// ---- authoring ------------------------------------------------------
export const createQuiz = (body: Record<string, any>) =>
  apiService.post<any>("/createQuiz", body);
export const updateQuiz = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateQuiz/${encodeURIComponent(id)}`, body);
export const deleteQuiz = (id: string) =>
  apiService.delete<any>(`/deleteQuiz/${encodeURIComponent(id)}`);

export const createQuestion = (body: Record<string, any>) =>
  apiService.post<any>("/createQuizQuestion", body);
export const updateQuestion = (id: string, body: Record<string, any>) =>
  apiService.put<any>(`/updateQuizQuestion/${encodeURIComponent(id)}`, body);
export const deleteQuestion = (id: string) =>
  apiService.delete<any>(`/deleteQuizQuestion/${encodeURIComponent(id)}`);
