import { QueryClient } from "@tanstack/react-query";

/** Shared React Query client for the learning module. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
