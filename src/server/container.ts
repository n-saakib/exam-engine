import "server-only";

import { config, type AppConfig } from "@/server/config";
import { getDb } from "@/server/data/db";
import {
  getAllSettings,
  patchSettings,
} from "@/server/data/repos/settingsRepo";
import type { SettingsPatch } from "@/domain/types";

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
  repos: {
    settings: {
      getAll: () => ReturnType<typeof getAllSettings>;
      patch: (patch: SettingsPatch) => ReturnType<typeof patchSettings>;
    };
    // additional repos added as they land (F2–F8)
  };
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
    repos: {
      settings: {
        // Resolve getDb() lazily at call time so HMR / test teardown + re-open
        // of the connection doesn't leave a stale closed handle in the closure.
        getAll: () => getAllSettings(getDb()),
        patch: (p: SettingsPatch) => patchSettings(getDb(), p),
      },
    },
  };
}

/** Resolve the (memoised) application container. */
export function getContainer(): Container {
  if (!globalForContainer.__certprepContainer) {
    globalForContainer.__certprepContainer = build();
  }
  return globalForContainer.__certprepContainer;
}
