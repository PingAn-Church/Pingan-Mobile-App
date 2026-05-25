import * as Localization from "expo-localization";
import { I18n } from "i18n-js";
import en from "./src/locales/en.json";
import zh from "./src/locales/zh.json";

const i18n = new I18n({ en, zh });

const rawLocale = Localization.getLocales()[0]?.languageTag || "en";
const normalizedLocale = rawLocale.startsWith("zh") ? "zh" : "en";

i18n.locale = normalizedLocale;

i18n.fallbacks = true;

export default i18n;
