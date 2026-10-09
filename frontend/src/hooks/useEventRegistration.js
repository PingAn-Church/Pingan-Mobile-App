import { useCallback, useEffect, useState } from "react";
import {
  cancelEventRegistration,
  getEventRegistration,
  registerForEvent,
} from "../service/EventService";

// One shared copy of each event's sign-up state for the whole app session.
//
// The same event can be shared into several chats and open on its detail page
// at once; registering from any of them has to flip every other one, or a
// member sees "Register" on one card after already signing up on another. So
// the state lives here, keyed by event id, and every card/page subscribes.
//
// A status of { missing: true } marks an event that no longer exists (404).

const statuses = new Map();
const listeners = new Map();
const inflight = new Map();

const keyOf = (eventId) => String(eventId);

const publish = (eventId, status) => {
  const key = keyOf(eventId);
  statuses.set(key, status);
  (listeners.get(key) || new Set()).forEach((listener) => listener(status));
};

export const getCachedEventStatus = (eventId) => statuses.get(keyOf(eventId)) || null;

export const loadEventStatus = (eventId, { force = false } = {}) => {
  const key = keyOf(eventId);
  if (!force && statuses.has(key)) return Promise.resolve(statuses.get(key));
  if (inflight.has(key)) return inflight.get(key);

  const request = getEventRegistration(eventId)
    .then((status) => {
      publish(eventId, status);
      return status;
    })
    .catch((error) => {
      if (error?.response?.status === 404) {
        const missing = { missing: true };
        publish(eventId, missing);
        return missing;
      }
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
};

const subscribe = (eventId, listener) => {
  const key = keyOf(eventId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => listeners.get(key)?.delete(listener);
};

/** Registers and publishes the result to every subscriber. Resolves to { ok, status }. */
export const registerEvent = async (eventId) => {
  const result = await registerForEvent(eventId);
  publish(eventId, result.status);
  return result;
};

/** Cancels and publishes the result to every subscriber. Resolves to { ok, status }. */
export const cancelEvent = async (eventId) => {
  const result = await cancelEventRegistration(eventId);
  publish(eventId, result.status);
  return result;
};

/**
 * The sign-up state of one event, kept in step with every other screen showing it.
 * `refresh` re-reads from the server (e.g. when a screen regains focus).
 */
export default function useEventRegistration(eventId) {
  const [status, setStatus] = useState(() => (eventId == null ? null : getCachedEventStatus(eventId)));
  const [loading, setLoading] = useState(() => eventId != null && !getCachedEventStatus(eventId));
  const [error, setError] = useState(null);

  const refresh = useCallback(
    async (force = true) => {
      if (eventId == null) return null;
      setError(null);
      try {
        return await loadEventStatus(eventId, { force });
      } catch (loadError) {
        setError(loadError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    if (eventId == null) return undefined;
    setStatus(getCachedEventStatus(eventId));
    const unsubscribe = subscribe(eventId, setStatus);
    refresh(false);
    return unsubscribe;
  }, [eventId, refresh]);

  return { status, loading, error, refresh };
}
