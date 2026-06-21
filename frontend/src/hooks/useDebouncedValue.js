import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delay` ms. Used to defer
 * expensive work (e.g. search requests) until the user pauses typing.
 */
export default function useDebouncedValue(value, delay = 700) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
