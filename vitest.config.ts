import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = {
  "@": path.resolve(root, "src"),
  // `server-only` throws outside an RSC bundle; alias it to a no-op for tests.
  // The real server/client boundary is still enforced by `next build`.
  "server-only": path.resolve(root, "src/test/server-only-stub.ts"),
};

/**
 * Two test projects:
 *   - "server": Node environment for src/server/** (DB, migrations, handlers).
 *   - "client": jsdom + React for components/hooks.
 * Playwright e2e specs (e2e/**) are excluded — they run under `npm run test:e2e`.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/*.test.ts", "src/domain/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "client",
          environment: "jsdom",
          globals: true,
          setupFiles: ["src/test/setup.client.ts"],
          include: ["src/**/*.test.tsx", "src/lib/**/*.test.ts"],
          exclude: ["src/server/**", "e2e/**", "node_modules/**"],
        },
      },
    ],
  },
});
