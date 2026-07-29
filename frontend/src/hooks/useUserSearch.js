import { useCallback, useEffect, useRef, useState } from "react";
import { searchUsers } from "../service/UserService";
import useDebouncedValue from "./useDebouncedValue";

const PAGE_SIZE = 20;

/**
 * Drives a paginated, debounced user-directory search for chat pickers.
 *
 * - The search only fires after the user pauses typing (700ms debounce).
 * - Results are paginated; call `loadMore()` (e.g. from a list's onEndReached)
 *   to append the next page — no manual button needed.
 * - `excludeId` filters a user out of results (typically the current user).
 *
 * Unverified accounts are dropped: chat is for admin-verified users only. The
 * search endpoint filters them server-side too, but this keeps the pickers
 * correct against a server that predates that filter. Only an explicit `false`
 * hides a row, so a payload without the flag still lists everyone rather than
 * showing an empty picker.
 */
export default function useUserSearch({ excludeId } = {}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 700);

  const [results, setResults] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Guards against out-of-order responses (a slow page-0 landing after a newer query).
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (term, pageToLoad, append) => {
      const requestId = ++requestIdRef.current;
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const res = await searchUsers(term, pageToLoad, PAGE_SIZE);
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        const list = (res?.data || []).filter(
          (u) =>
            u?.verifiedUser !== false &&
            (excludeId == null || String(u.id) !== String(excludeId))
        );
        setResults((prev) => (append ? [...prev, ...list] : list));
        setHasMore(Boolean(res?.pagination?.hasMore));
        setPage(pageToLoad);
      } catch (error) {
        if (requestId === requestIdRef.current && !append) {
          setResults([]);
          setHasMore(false);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          append ? setLoadingMore(false) : setLoading(false);
        }
      }
    },
    [excludeId]
  );

  // Reload from the first page whenever the debounced query changes.
  useEffect(() => {
    fetchPage(debouncedQuery, 0, false);
  }, [debouncedQuery, fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(debouncedQuery, page + 1, true);
  }, [loading, loadingMore, hasMore, debouncedQuery, page, fetchPage]);

  return { query, setQuery, results, loading, loadingMore, hasMore, loadMore };
}
