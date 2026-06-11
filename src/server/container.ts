import "server-only";

import { config, type AppConfig } from "@/server/config";
import { getDb } from "@/server/data/db";
import {
  getAllSettings,
  patchSettings,
  resetSettings,
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
import {
  createPathResolver,
  type PathResolver,
} from "@/server/services/pathResolver";
import {
  createSessionRepo,
  type SessionRepo,
} from "@/server/data/repos/sessionRepo";
import {
  createAnswerRepo,
  type AnswerRepo,
} from "@/server/data/repos/answerRepo";
import {
  createExamEngine,
  type ExamEngine,
} from "@/server/services/examEngine";
import {
  createStatsService,
  type StatsService,
} from "@/server/services/statsService";
import {
  createExportService,
  type ExportService,
} from "@/server/services/exportService";

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
      reset: () => void;
    };
    setCatalog: SetCatalogRepo;
    completion: CompletionRepo;
    session: SessionRepo;
    answer: AnswerRepo;
  };
  services: {
    setCatalog: SetCatalogService;
    pathResolver: PathResolver;
    examEngine: ExamEngine;
    stats: StatsService;
    export: ExportService;
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
  const sessionRepo = createSessionRepo(db);
  const answerRepo = createAnswerRepo(db);

  // Services
  const setCatalogService = createSetCatalogService(setCatalogRepo, completionRepo);

  // PathResolver — stateless (reads the file fresh each call); created here so
  // it participates in the container's lifetime and can be swapped in tests.
  const pathResolver = createPathResolver();

  const examEngine = createExamEngine({
    sessionRepo,
    answerRepo,
    completionRepo,
    setCatalog: setCatalogService,
    pathResolver,
    // Lazily read settings (defaults merged) for create-time options.
    getSettings: () => getAllSettings(getDb()),
  });

  const statsService = createStatsService(sessionRepo);
  const exportService = createExportService(db);

  return {
    config,
    repos: {
      settings: {
        // Resolve getDb() lazily at call time so HMR / test teardown + re-open
        // of the connection doesn't leave a stale closed handle in the closure.
        getAll: () => getAllSettings(getDb()),
        patch: (p: SettingsPatch) => patchSettings(getDb(), p),
        reset: () => resetSettings(getDb()),
      },
      setCatalog: setCatalogRepo,
      completion: completionRepo,
      session: sessionRepo,
      answer: answerRepo,
    },
    services: {
      setCatalog: setCatalogService,
      pathResolver,
      examEngine,
      stats: statsService,
      export: exportService,
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
