import "server-only";

import { config, type AppConfig } from "@/server/config";
import { getDb } from "@/server/data/db";

/**
 * Composition root (the only place that wires concrete dependencies together).
 * F0 stub: it exposes the resolved config and the DB handle. As repositories and
 * services land (F2–F8) they are constructed here and exposed on `Container`, so
 * route handlers depend on this assembled object rather than reaching into
 * `data/` or `services/` directly.
 *
 * Built lazily and memoised on `globalThis` so HMR reuses one instance.
 */
export interface Container {
  config: AppConfig;
  // repos:    { … }   ← added as repositories land
  // services: { … }   ← added as services land
}

const globalForContainer = globalThis as unknown as {
  __certprepContainer?: Container;
};

function build(): Container {
  // Touch the DB so the singleton + pragmas are initialised when the container
  // is first resolved (services constructed here will need it).
  getDb();
  return {
    config,
  };
}

/** Resolve the (memoised) application container. */
export function getContainer(): Container {
  if (!globalForContainer.__certprepContainer) {
    globalForContainer.__certprepContainer = build();
  }
  return globalForContainer.__certprepContainer;
}
