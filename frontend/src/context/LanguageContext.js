import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../../i18n";
import { updateMyLanguage } from "../service/UserService";

export const LanguageContext = createContext();

const DEFAULT_LANGUAGE = "zh";

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    const loadLanguage = async () => {
      const storedLang = await AsyncStorage.getItem("appLanguage");
      const nextLanguage = storedLang || DEFAULT_LANGUAGE;
      setLanguage(nextLanguage);
      i18n.locale = nextLanguage;
    };

    loadLanguage();
  }, []);

  const toggleLanguage = async () => {
    const newLang = language === "en" ? "zh" : "en";
    setLanguage(newLang);
    i18n.locale = newLang;
    await AsyncStorage.setItem("appLanguage", newLang);
    // Push notification text is written server-side, so the backend needs to
    // know the new choice. Best-effort — UserContext re-reports it on sign-in.
    updateMyLanguage(newLang);
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
