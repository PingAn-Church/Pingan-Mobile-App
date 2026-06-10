import apiService from "./apiService";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon?: string | null;
  type?: string | null;
  points: number;
  earned: boolean;
  earnedAt?: string | null;
}

const str = (v: any, d = ""): string => (v == null ? d : String(v));
const num = (v: any, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const map = (a: any): Achievement => ({
  id: str(a.id),
  name: str(a.name),
  description: str(a.description),
  icon: a.icon ?? null,
  type: a.type ?? null,
  points: num(a.points),
  earned: !!a.earned,
  earnedAt: a.earned_at ?? null,
});

/** Achievement catalogue with the current user's earned status. */
export const getAchievements = async (): Promise<Achievement[]> => {
  const res = await apiService.get<any>("/getAchievements");
  const arr = res?.data ?? res ?? [];
  return (Array.isArray(arr) ? arr : []).map(map);
};
