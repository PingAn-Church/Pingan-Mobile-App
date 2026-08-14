import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import { apiUrl } from "../../service/apiConfig";
import { getAuthToken } from "../../service/TokenService";
import {
  ASSESSMENT_VERSION,
  calculateScores,
  isValidResult,
  QUESTION_COUNT,
  type SpiritualGiftResult,
} from "./spiritualGiftData";

const GUEST_RESULT_KEY = `spiritualGift.${ASSESSMENT_VERSION}.guestResult`;
const PROGRESS_KEY_PREFIX = `spiritualGift.${ASSESSMENT_VERSION}.progress.`;

/** Identifies whose partial answers these are, so two people sharing a device
 *  never resume into each other's attempt. */
export type AssessmentOwner = number | string | null | undefined;

export interface AssessmentProgress {
  answers: Array<number | null>;
  currentIndex: number;
}

const progressKey = (owner: AssessmentOwner) => `${PROGRESS_KEY_PREFIX}${owner ?? "guest"}`;

export async function getMySpiritualGiftResult(): Promise<SpiritualGiftResult | null> {
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");
  const response = await axios.get(apiUrl("/api/spiritual-gifts/me/result"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = response.data?.data ?? null;
  return isValidResult(result) ? result : null;
}

export async function replaceMySpiritualGiftResult(
  answers: number[]
): Promise<SpiritualGiftResult> {
  // Fail locally before making a malformed request; the server independently
  // validates and scores the same transient answers.
  calculateScores(answers);
  const token = await getAuthToken();
  if (!token) throw new Error("Authentication required");
  const response = await axios.put(
    apiUrl("/api/spiritual-gifts/me/result"),
    { assessmentVersion: ASSESSMENT_VERSION, answers },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const result = response.data?.data;
  if (!isValidResult(result)) throw new Error("Invalid spiritual gift result returned by server");
  return result;
}

export async function getGuestSpiritualGiftResult(): Promise<SpiritualGiftResult | null> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_RESULT_KEY);
    if (!raw) return null;
    const result = JSON.parse(raw);
    return isValidResult(result) ? result : null;
  } catch {
    return null;
  }
}

export async function replaceGuestSpiritualGiftResult(
  answers: number[]
): Promise<SpiritualGiftResult> {
  const result: SpiritualGiftResult = {
    assessmentVersion: ASSESSMENT_VERSION,
    scores: calculateScores(answers),
    completedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(GUEST_RESULT_KEY, JSON.stringify(result));
  return result;
}

/**
 * The questionnaire is 125 questions long, so the OS is likely to reclaim the app
 * before someone finishes it. Partial answers are kept locally and are only ever
 * read back into the attempt they came from.
 */
export async function loadAssessmentProgress(
  owner: AssessmentOwner
): Promise<AssessmentProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey(owner));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved?.answers) || saved.answers.length !== QUESTION_COUNT) return null;

    const answers: Array<number | null> = saved.answers.map((answer: unknown) =>
      Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) <= 3
        ? (answer as number)
        : null
    );
    if (!answers.some((answer) => answer !== null)) return null;

    const savedIndex = Number.isInteger(saved.currentIndex) ? saved.currentIndex : 0;
    return {
      answers,
      currentIndex: Math.min(Math.max(savedIndex, 0), QUESTION_COUNT - 1),
    };
  } catch {
    return null;
  }
}

export async function saveAssessmentProgress(
  owner: AssessmentOwner,
  progress: AssessmentProgress
): Promise<void> {
  try {
    await AsyncStorage.setItem(progressKey(owner), JSON.stringify(progress));
  } catch {
    // A dropped progress write must never interrupt the questionnaire itself.
  }
}

export async function clearAssessmentProgress(owner: AssessmentOwner): Promise<void> {
  try {
    await AsyncStorage.removeItem(progressKey(owner));
  } catch {
    // Nothing to recover from: the next attempt overwrites this key anyway.
  }
}

/**
 * Guest results and in-progress answers are cache data and are removed by
 * Storage > Clear cache. Both are announced in that screen's confirmation,
 * because neither can be recovered afterwards.
 */
export async function clearLocalSpiritualGiftCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter(
    (key) => key === GUEST_RESULT_KEY || key.startsWith(PROGRESS_KEY_PREFIX)
  );
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
}
