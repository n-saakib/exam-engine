#!/usr/bin/env bash
#
# CertPrep — run the app locally WITHOUT Docker.
#
#   ./scripts/run-local.sh            # interactive (asks mode + port)
#   ./scripts/run-local.sh -y         # accept all defaults: prod build + start on :3000
#   ./scripts/run-local.sh --dev      # dev mode (next dev, hot reload)
#   ./scripts/run-local.sh -y --port 4000
#
# Flags:
#   -y, --yes        Non-interactive; accept every default and just run.
#   --dev | --prod   Force dev (hot reload) or prod (build + start) mode.
#   --port N         Port to listen on (default 3000).
#   --host H         Host/interface to bind (default 127.0.0.1, local-only).
#   --no-install     Skip dependency install even if node_modules is missing.
#   -h, --help       Show this help.
#
set -euo pipefail

# ── repo root (this script lives in <root>/scripts) ──────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── pretty output ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'; else C_B=; C_G=; C_Y=; C_R=; C_0=; fi
say()  { printf '%s\n' "${C_B}▶ $*${C_0}"; }
ok()   { printf '%s\n' "${C_G}✓ $*${C_0}"; }
warn() { printf '%s\n' "${C_Y}! $*${C_0}"; }
die()  { printf '%s\n' "${C_R}✗ $*${C_0}" >&2; exit 1; }

# ── defaults / flags ─────────────────────────────────────────────────────────
ASSUME_YES=0; MODE=""; PORT=3000; HOST="127.0.0.1"; DO_INSTALL="auto"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)     ASSUME_YES=1 ;;
    --dev)        MODE="dev" ;;
    --prod)       MODE="prod" ;;
    --port)       PORT="${2:?--port needs a value}"; shift ;;
    --host)       HOST="${2:?--host needs a value}"; shift ;;
    --no-install) DO_INSTALL="no" ;;
    -h|--help)    awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next}{exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)            die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

# ── interactive helpers (respect -y; read from the real terminal) ────────────
ask() {  # ask VAR "Question" "default"
  local __var="$1" __q="$2" __def="$3" __ans=""
  if (( ASSUME_YES )) || [[ ! -r /dev/tty ]]; then printf -v "$__var" '%s' "$__def"; return; fi
  read -r -p "$(printf '%s [%s]: ' "$__q" "$__def")" __ans </dev/tty || __ans=""
  printf -v "$__var" '%s' "${__ans:-$__def}"
}
confirm() {  # confirm "Question" "Y|N"  -> exit 0 if yes
  local __q="$1" __def="${2:-Y}" __ans=""
  if (( ASSUME_YES )) || [[ ! -r /dev/tty ]]; then [[ "$__def" =~ ^[Yy] ]]; return; fi
  local hint="y/N"; [[ "$__def" =~ ^[Yy] ]] && hint="Y/n"
  read -r -p "$(printf '%s [%s]: ' "$__q" "$hint")" __ans </dev/tty || __ans=""
  [[ "${__ans:-$__def}" =~ ^[Yy] ]]
}

# ── prerequisites ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js is not installed (need Node 22). https://nodejs.org"
command -v npm  >/dev/null 2>&1 || die "npm is not installed."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  warn "Node $(node -v) detected; this app targets Node 22. Continuing, but native modules may misbehave."
fi

say "CertPrep — local run"
printf '   repo: %s\n' "$ROOT"

# ── mode ─────────────────────────────────────────────────────────────────────
if [[ -z "$MODE" ]]; then
  ask MODE "Run mode — 'prod' (build + start) or 'dev' (hot reload)" "prod"
fi
[[ "$MODE" == "dev" || "$MODE" == "prod" ]] || die "mode must be 'dev' or 'prod' (got '$MODE')"

# ── port ─────────────────────────────────────────────────────────────────────
ask PORT "Port" "$PORT"
[[ "$PORT" =~ ^[0-9]+$ ]] || die "port must be a number (got '$PORT')"

# ── dependencies ─────────────────────────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  if [[ "$DO_INSTALL" == "no" ]]; then
    die "node_modules is missing and --no-install was given. Run 'npm ci' first."
  fi
  if confirm "Install dependencies now (npm ci)?" "Y"; then
    say "Installing dependencies (this also builds the better-sqlite3 native addon)…"
    if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
    ok "Dependencies installed."
  else
    die "Dependencies are required to run. Aborting."
  fi
else
  ok "Dependencies present (node_modules)."
fi

# ── run ──────────────────────────────────────────────────────────────────────
URL="http://${HOST}:${PORT}"
if [[ "$MODE" == "dev" ]]; then
  say "Starting dev server (hot reload) at ${C_G}${URL}${C_0}  —  Ctrl-C to stop"
  exec npm run dev -- --hostname "$HOST" --port "$PORT"
else
  REBUILD=1
  if [[ -d .next ]]; then
    confirm "A previous build exists. Rebuild before starting?" "Y" && REBUILD=1 || REBUILD=0
  fi
  if (( REBUILD )); then
    say "Building production bundle…"
    npm run build
    ok "Build complete."
  else
    warn "Using existing build in .next/"
  fi
  say "Starting production server at ${C_G}${URL}${C_0}  —  Ctrl-C to stop"
  say "On first load the question catalogue scans in the background; refresh once if a list looks empty."
  exec npm run start -- --hostname "$HOST" --port "$PORT"
fi
