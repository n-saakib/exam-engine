import "server-only";

import { config, type AppConfig } from "@/server/config";
import { getDb } from "@/server/data/db";
import {
  getAllSettings,
  patchSettings,
} from "@/server/data/repos/settingsRepo";
import type { SettingsPatch } from "@/domain/types";
import {
  createSetCatalogRepo,
  type SetCatalogRepo,
} from "@/server/data/repos/setCatalogRepo";
import {
  createCompletionRepo,
  type CompletionRepo,
} from "@/server/data/repos/completionRepo";
import {
  createSetCatalogService,
  type SetCatalogService,
} from "@/server/services/setCatalog";

/**
 * Composition root (the only place that wires concrete dependencies together).
 * Built lazily and memoised on `globalThis` so HMR reuses one instance. Route
 * handlers depend on this assembled object rather than reaching into `data/` or
 * `services/` directly.
 *
 * Wires: settings repo (F1); setCatalog/completion repos + setCatalog service (F3).
 * Further repos/services are added here as they land (F4–F8).
 */
export interface Container {
  config: AppConfig;
  repos: {
    settings: {
      getAll: () => ReturnType<typeof getAllSettings>;
      patch: (patch: SettingsPatch) => ReturnType<typeof patchSettings>;
    };
    setCatalog: SetCatalogRepo;
    completion: CompletionRepo;
  };
  services: {
    setCatalog: SetCatalogService;
  };
}

const globalForContainer = globalThis as unknown as {
  __certprepContainer?: Container;
};

function build(): Container {
  const db = getDb();

  // Repos
  const setCatalogRepo = createSetCatalogRepo(db);
  const completionRepo = createCompletionRepo(db);

  // Services
  const setCatalogService = createSetCatalogService(setCatalogRepo, completionRepo);

  return {
    config,
    repos: {
      settings: {
        // Resolve getDb() lazily at call time so HMR / test teardown + re-open
        // of the connection doesn't leave a stale closed handle in the closure.
        getAll: () => getAllSettings(getDb()),
        patch: (p: SettingsPatch) => patchSettings(getDb(), p),
      },
      setCatalog: setCatalogRepo,
      completion: completionRepo,
    },
    services: {
      setCatalog: setCatalogService,
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

/**
 * Reset the memoised container (for test isolation only). Call this after
 * closing the DB (`closeDb()`) so the next `getContainer()` rebuilds cleanly
 * against a fresh DB.
 */
export function resetContainer(): void {
  globalForContainer.__certprepContainer = undefined;
}
