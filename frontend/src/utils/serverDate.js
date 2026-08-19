/**
 * Parses timestamps the backend sends, in every shape it sends them.
 *
 * The backend JVM runs in UTC (pinned in backend/Dockerfile), but its payloads
 * carry three shapes with different amounts of zone information:
 *
 *   - "2026-08-19 12:34:56.789"   chat messages (Timestamp.toString())
 *   - "2026-08-19T12:34:56.789"   LocalDateTime fields (topics, form applications)
 *   - "2026-08-19T12:34:56Z" / "+00:00" / epoch millis   Instant & java.sql via Jackson
 *
 * The first two are UTC wall-clock with the zone marker missing. Handing them to
 * new Date() directly makes JS read them as DEVICE-local time — which showed
 * every topic timestamp 8 hours early for our UTC+8 users — and Safari rejects
 * the space-separated form outright, breaking chat-list ordering on web. This
 * normalizes all shapes into one rule: space becomes 'T', and a 'Z' is appended
 * when no zone is present, so every surface agrees the server speaks UTC.
 *
 * Date-only strings ("1990-05-01") and strings already carrying a zone pass
 * through untouched. Returns null when unparseable so callers keep their own
 * fallbacks. Event dates deliberately do NOT go through here — they are
 * wall-clock times entered and displayed as-is (see EventService).
 */
export const parseServerDate = (raw) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" || raw instanceof Date) {
    const direct = new Date(raw);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  let value = String(raw).trim();
  if (!value) return null;
  if (value.includes(" ") && !value.includes("T")) {
    value = value.replace(" ", "T");
  }
  if (value.includes("T") && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    value += "Z";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Epoch millis for sorting; 0 when absent/unparseable (sorts oldest). */
export const serverDateMillis = (raw) => {
  const parsed = parseServerDate(raw);
  return parsed ? parsed.getTime() : 0;
};
