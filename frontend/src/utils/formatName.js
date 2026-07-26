import i18n from "../../i18n";

// CJK ideograph ranges (Unified + Ext-A + Compatibility). Used to decide whether a
// name is written in Chinese characters (no separating space) or Latin (keep a space).
const CJK_REGEX = /[㐀-䶿一-鿿豈-﫿]/;

const isChineseLocale = (language) => {
  const lang = (language || i18n.locale || "en").toString().toLowerCase();
  return lang.startsWith("zh");
};

/**
 * Order a person's name for display.
 *
 * Chinese convention puts the family name first ("<last><first>"); English keeps
 * given-first ("<first> <last>"). The join is CJK-aware: Chinese-character names get
 * no separating space (张 + 伟 → 张伟) while Latin names keep one (John Smith →
 * Smith John). English mode is always given-first with a space.
 *
 * `language` is optional — it defaults to the current app locale (i18n.locale), so
 * components re-render into the right order when the language toggles.
 */
export const formatName = (firstName, lastName, language) => {
  const first = (firstName == null ? "" : String(firstName)).trim();
  const last = (lastName == null ? "" : String(lastName)).trim();

  if (!first || !last) return first || last; // nothing to reorder

  if (isChineseLocale(language)) {
    const separator = CJK_REGEX.test(first) || CJK_REGEX.test(last) ? "" : " ";
    return `${last}${separator}${first}`;
  }
  return `${first} ${last}`;
};

/** Convenience for objects carrying `firstName` / `lastName`. */
export const formatUserName = (user, language) =>
  formatName(user?.firstName, user?.lastName, language);
