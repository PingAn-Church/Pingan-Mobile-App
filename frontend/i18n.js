import { I18n } from "i18n-js";
import en from "./src/locales/en.json";
import zh from "./src/locales/zh.json";

const i18n = new I18n({ en, zh });

i18n.locale = "zh";
i18n.defaultLocale = "zh";
i18n.fallbacks = true;

export default i18n;
