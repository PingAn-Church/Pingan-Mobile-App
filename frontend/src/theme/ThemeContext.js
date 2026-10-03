import React, { createContext, useContext } from "react";
import { standardTheme } from "./standardTheme";

// Same pattern as LanguageContext: one provider near the top of the app, and
// any component reads the current theme with useTheme().
const ThemeContext = createContext(standardTheme);

export function ThemeProvider({ children }) {
  return <ThemeContext.Provider value={standardTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
