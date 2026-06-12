import apiService from "./apiService";

export type GoalMetric = "courses_completed" | "quizzes_passed" | "minutes_spent";

export interface LearningGoal {
  id: string;
  label: string;
  metric: GoalMetric | string;
  targetValue: number;
  currentValue: number;
  rewardPoints: number;
  isActive: boolean;
  isCompleted: boolean;
  deadline?: string | null;
}

export interface GoalTemplate {
  id: string;
  label: string;
  difficulty?: string | null;
  metric: GoalMetric | string;
  targetValue: number;
  rewardPoints: number;
}

export interface GoalsData {
  goals: LearningGoal[];
  currentStreak: number;
  longestStreak: number;
}

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const mapGoal = (g: any): LearningGoal => ({
  id: str(g.id),
  label: str(g.label),
  metric: str(g.metric),
  targetValue: num(g.target_value),
  currentValue: num(g.current_value),
  rewardPoints: num(g.reward_points),
  isActive: !!g.is_active,
  isCompleted: !!g.is_completed,
  deadline: g.deadline ?? null,
});

const mapTemplate = (t: any): GoalTemplate => ({
  id: str(t.id),
  label: str(t.label),
  difficulty: t.difficulty ?? null,
  metric: str(t.metric),
  targetValue: num(t.target_value),
  rewardPoints: num(t.reward_points),
});

export const getGoals = async (): Promise<GoalsData> => {
  const res = await apiService.get<any>("/getGoals");
  const d = res?.data ?? res ?? {};
  return {
    goals: (Array.isArray(d.goals) ? d.goals : []).map(mapGoal),
    currentStreak: num(d.current_streak),
    longestStreak: num(d.longest_streak),
  };
};

export const getGoalTemplates = async (): Promise<GoalTemplate[]> => {
  const res = await apiService.get<any>("/getGoalTemplates");
  const arr = res?.data ?? res ?? [];
  return (Array.isArray(arr) ? arr : []).map(mapTemplate);
};

export const createGoalsFromTemplates = (templateIds: string[]) =>
  apiService.post<any>("/createGoalsFromTemplates", { templateIds });

export const setGoalActive = (goalId: string, isActive: boolean) =>
  apiService.post<any>("/setGoalActive", { goalId, isActive });

export const clearGoal = (goalId: string) =>
  apiService.post<any>("/clearGoal", { goalId });

export const metricLabel = (metric: string): string =>
  metric === "courses_completed"
    ? "courses"
    : metric === "quizzes_passed"
    ? "quizzes"
    : metric === "minutes_spent"
    ? "minutes"
    : "";
