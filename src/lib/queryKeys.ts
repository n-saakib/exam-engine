/**
 * Centralised React Query keys (04 §7). One place so mutations invalidate the
 * exact keys queries use. `as const` keeps tuples literal for type-safe matching.
 */
export const queryKeys = {
  health: () => ["health"] as const,
  examPaths: () => ["examPaths"] as const,
  sets: (quesPath: string) => ["sets", quesPath] as const,
  set: (setId: string) => ["set", setId] as const,
  session: (id: string) => ["session", id] as const,
  sessions: (status?: string) =>
    (status ? (["sessions", status] as const) : (["sessions"] as const)),
  results: (id: string) => ["results", id] as const,
  history: (filters?: Record<string, unknown>) =>
    (filters ? (["history", filters] as const) : (["history"] as const)),
  stats: (filters?: Record<string, unknown>) =>
    (filters ? (["stats", filters] as const) : (["stats"] as const)),
  settings: () => ["settings"] as const,
  inProgressCount: () => ["inProgressCount"] as const,
  diagnostics: () => ["diagnostics"] as const,
} as const;

export type QueryKeys = typeof queryKeys;
