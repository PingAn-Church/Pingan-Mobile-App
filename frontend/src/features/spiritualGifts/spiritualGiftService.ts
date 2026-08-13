import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import { apiUrl } from "../../service/apiConfig";
import { getAuthToken } from "../../service/TokenService";
import {
  ASSESSMENT_VERSION,
  calculateScores,
  isValidResult,
  type SpiritualGiftResult,
} from "./spiritualGiftData";

const GUEST_RESULT_KEY = `spiritualGift.${ASSESSMENT_VERSION}.guestResult`;

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

/** Guest assessment data is cache data and is removed by Storage > Clear cache. */
export async function clearLocalSpiritualGiftCache(): Promise<void> {
  await AsyncStorage.removeItem(GUEST_RESULT_KEY);
}
