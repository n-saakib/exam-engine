# syntax=docker/dockerfile:1
#
# CertPrep — local-first exam practice app (Next.js + SQLite).
# Multi-stage build producing a small image that runs the Next.js *standalone*
# server. better-sqlite3 is a native addon: it is compiled in the `deps`/`build`
# stages (which have the toolchain) and its prebuilt .node binary is carried into
# the standalone output by Next's file-trace, so the runner needs no toolchain.
#
# Data (the SQLite DB) lives under /app/data — mount a volume there to persist it.
# Question content (/app/Exams + /app/exam-paths.json) is baked in; bind-mount over
# them to use your own sets without rebuilding.

# ──────────────────────────────────────────────────────────────────────────────
# 1) deps — install node deps with the native-build toolchain
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ──────────────────────────────────────────────────────────────────────────────
# 2) build — produce .next/standalone (includes the better-sqlite3 .node binary)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# BUILD_STANDALONE=1 switches next.config.ts to `output: 'standalone'` (see note there).
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# 3) runner — minimal image, non-root, runs `node server.js`
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/app/data/certprep.db \
    EXAMS_ROOT=/app/Exams \
    EXAM_PATHS_FILE=/app/exam-paths.json

# Run as a non-root user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server + its traced node_modules (with the better-sqlite3 native .node).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets and public files are NOT part of standalone — copy them alongside.
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Question content + navigation tree (read at runtime by the catalogue scan on boot).
COPY --from=build --chown=nextjs:nodejs /app/Exams ./Exams
COPY --from=build --chown=nextjs:nodejs /app/exam-paths.json ./exam-paths.json
# Runtime data dir (SQLite DB) — also the volume mount point.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

# Liveness via the app's own health endpoint (Node 22 has global fetch; no curl needed).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
