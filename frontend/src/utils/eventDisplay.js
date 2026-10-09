import i18n from "../../i18n";

/**
 * "Sun, 4 Oct" / "10月4日 周日" from a stored "YYYY-MM-DD". Built from the parts
 * rather than new Date(string), which reads the bare date as UTC midnight and
 * shows the day before anywhere west of UTC.
 */
export const formatEventDay = (date, language) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  if (!match) return String(date || "");
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  try {
    return day.toLocaleDateString(String(language || "").startsWith("zh") ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
  } catch (error) {
    return String(date);
  }
};

export const formatEventTimeRange = (startTime, endTime) =>
  [startTime, endTime].filter(Boolean).join(" - ");

/**
 * "12 registered" or "12 / 30 registered". Accepts either a status from
 * /registration or a list item, which name the numbers slightly differently.
 */
export const formatRegisteredCount = (source) => {
  if (!source) return "";
  const count = Number(source.registeredCount ?? 0);
  const capacity = source.capacity ?? source.registrationCapacity;
  return capacity
    ? i18n.t("registeredCountWithCapacity", { count, capacity })
    : i18n.t("registeredCount", { count });
};

/**
 * The short state label for a list item: registered / full / open. Null for an
 * event without sign-up, so callers can skip the chip entirely.
 */
export const registrationChipFor = (summary) => {
  if (!summary?.registrationEnabled) return null;
  if (summary.registered) return { label: i18n.t("eventRegistered"), tone: "done" };
  const capacity = summary.registrationCapacity;
  if (capacity && Number(summary.registeredCount ?? 0) >= capacity) {
    return { label: i18n.t("registrationFull"), tone: "muted" };
  }
  return { label: i18n.t("registrationOpenChip"), tone: "open" };
};
