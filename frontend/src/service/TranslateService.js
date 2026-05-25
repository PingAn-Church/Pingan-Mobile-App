import axios from "axios";
import Constants from "expo-constants";
import { getAuthToken } from "./TokenService";

const { IP_ADDR, ENABLE_LIBRE_TRANSLATE } = Constants.expoConfig?.extra || {}; // Get app config

export const isTranslationEnabled = ENABLE_LIBRE_TRANSLATE === true;

const normalizeTargetLanguage = (targetLanguage) => {
  const raw = String(targetLanguage || "en").trim().toLowerCase();
  const base = raw.split("-")[0];
  return base === "zh" ? "zh" : "en";
};

/**
 * Sends a text translation request to the Spring Boot backend.
 * @param {string} text - The content to be translated.
 * @param {string} targetLanguage - The ISO 639-1 language code (e.g., 'en', 'zh').
 * @returns {Promise<string>} - The translated text content.
 */
export const translateText = async (text, targetLanguage) => {
  if (!isTranslationEnabled) {
    throw new Error("Translation service is disabled.");
  }

  const sourceText = String(text || "");
  if (!sourceText.trim()) {
    return sourceText;
  }

  const token = await getAuthToken();
  const normalizedTargetLanguage = normalizeTargetLanguage(targetLanguage);

  if (!token) {
    throw new Error("No token found.");
  }

  try {
    const response = await axios.post(
      `http://${IP_ADDR}:8080/api/translate`,
      {
        text: sourceText,
        targetLanguage: normalizedTargetLanguage,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const translatedText = response?.data?.translatedText;
    return typeof translatedText === "string" && translatedText.length > 0
      ? translatedText
      : sourceText;
  } catch (error) {
    console.error("Error calling translation service:", error);
    throw error;
  }
};
