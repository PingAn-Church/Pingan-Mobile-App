import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../../i18n";

export const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    const loadLanguage = async () => {
      const storedLang = await AsyncStorage.getItem("appLanguage");
      if (storedLang) {
        setLanguage(storedLang);
        i18n.locale = storedLang;
      }
    };
    loadLanguage();
  }, []);

  const toggleLanguage = async () => {
    const newLang = language === "en" ? "zh" : "en";
    setLanguage(newLang);
    i18n.locale = newLang;
    await AsyncStorage.setItem("appLanguage", newLang);
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};
