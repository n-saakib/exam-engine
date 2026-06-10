import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React strict mode (double-invokes effects in dev to surface bugs).
  reactStrictMode: true,

  // better-sqlite3 is a native addon and must NEVER be bundled by webpack/turbopack.
  // Keep it external so it is `require`d at runtime from node_modules in the Node.js
  // server runtime. (On Next < 15 this key was `experimental.serverComponentsExternalPackages`.)
  serverExternalPackages: ["better-sqlite3"],

  // instrumentation.ts `register()` is enabled by default in Next 15+/16 — no flag needed.
};

export default nextConfig;
