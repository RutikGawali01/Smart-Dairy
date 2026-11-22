import { QueryClient } from '@tanstack/react-query';

/**
 * Enterprise-grade TanStack Query Client Configuration.
 * 
 * - staleTime (60s): Data is fresh for 60 seconds; identical queries during this window
 *   are served instantly from memory without dispatching network requests (Automatic Deduplication).
 * - gcTime (10m): Unused data stays in memory for 10 minutes before garbage collection.
 * - refetchOnWindowFocus (false): Prevents unnecessary refetches when user switches browser tabs.
 * - retry (1): Retries once before failing to handle transient network hiccups gracefully.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Clears all server-state caches in QueryClient (called on user logout or session expiry).
 */
export function clearAppQueryCache() {
  queryClient.clear();
}

