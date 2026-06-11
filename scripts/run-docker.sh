#!/usr/bin/env bash
#
# CertPrep — build & run the app in Docker.
#
#   ./scripts/run-docker.sh           # interactive (port, data location, Exams mount)
#   ./scripts/run-docker.sh -y        # accept all defaults: build + run on :3000,
#                                      # named volume for data, baked-in question sets
#   ./scripts/run-docker.sh -y --port 4000
#
# Flags:
#   -y, --yes         Non-interactive; accept every default and just run.
#   --port N          Host port to expose (default 3000). Bound to 127.0.0.1 only.
#   --name NAME       Container name (default certprep).
#   --tag TAG         Image tag (default certprep:latest).
#   --data-volume     Persist the SQLite DB in a named Docker volume (default).
#   --data-dir DIR    Persist the SQLite DB in a host directory instead.
#   --mount-exams     Bind-mount ./Exams + ./exam-paths.json (edit sets without rebuild).
#   --no-build        Reuse the existing image; do not rebuild.
#   --rebuild         Force a rebuild even if the image exists.
#   -h, --help        Show this help.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -t 1 ]]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'; else C_B=; C_G=; C_Y=; C_R=; C_0=; fi
say()  { printf '%s\n' "${C_B}▶ $*${C_0}"; }
ok()   { printf '%s\n' "${C_G}✓ $*${C_0}"; }
warn() { printf '%s\n' "${C_Y}! $*${C_0}"; }
die()  { printf '%s\n' "${C_R}✗ $*${C_0}" >&2; exit 1; }

# ── defaults / flags ─────────────────────────────────────────────────────────
ASSUME_YES=0; PORT=3000; CONTAINER="certprep"; IMAGE="certprep:latest"
DATA_MODE="volume"; DATA_DIR="$ROOT/data"; MOUNT_EXAMS=0; BUILD_MODE="auto"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)      ASSUME_YES=1 ;;
    --port)        PORT="${2:?--port needs a value}"; shift ;;
    --name)        CONTAINER="${2:?--name needs a value}"; shift ;;
    --tag)         IMAGE="${2:?--tag needs a value}"; shift ;;
    --data-volume) DATA_MODE="volume" ;;
    --data-dir)    DATA_MODE="dir"; DATA_DIR="${2:?--data-dir needs a value}"; shift ;;
    --mount-exams) MOUNT_EXAMS=1 ;;
    --no-build)    BUILD_MODE="no" ;;
    --rebuild)     BUILD_MODE="yes" ;;
    -h|--help)     awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next}{exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)             die "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

ask() {
  local __var="$1" __q="$2" __def="$3" __ans=""
  if (( ASSUME_YES )) || [[ ! -r /dev/tty ]]; then printf -v "$__var" '%s' "$__def"; return; fi
  read -r -p "$(printf '%s [%s]: ' "$__q" "$__def")" __ans </dev/tty || __ans=""
  printf -v "$__var" '%s' "${__ans:-$__def}"
}
confirm() {
  local __q="$1" __def="${2:-Y}" __ans=""
  if (( ASSUME_YES )) || [[ ! -r /dev/tty ]]; then [[ "$__def" =~ ^[Yy] ]]; return; fi
  local hint="y/N"; [[ "$__def" =~ ^[Yy] ]] && hint="Y/n"
  read -r -p "$(printf '%s [%s]: ' "$__q" "$hint")" __ans </dev/tty || __ans=""
  [[ "${__ans:-$__def}" =~ ^[Yy] ]]
}

# ── prerequisites ────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed / not on PATH.
   On WSL2: install Docker Desktop and enable 'WSL integration' for this distro,
   or install Docker Engine in the distro. https://docs.docker.com/get-docker/"
fi
if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but the daemon isn't reachable. Start Docker Desktop
   (or 'sudo service docker start') and try again."
fi

say "CertPrep — Docker run"
printf '   repo:  %s\n' "$ROOT"

# ── interactive config ───────────────────────────────────────────────────────
ask PORT "Host port (exposed on 127.0.0.1 only)" "$PORT"
[[ "$PORT" =~ ^[0-9]+$ ]] || die "port must be a number (got '$PORT')"

if (( ! ASSUME_YES )) && [[ -r /dev/tty ]]; then
  if confirm "Persist the database in a host folder (./data) instead of a Docker volume?" "N"; then
    DATA_MODE="dir"; ask DATA_DIR "Host data directory" "$DATA_DIR"
  fi
  confirm "Bind-mount ./Exams so you can edit question sets without rebuilding?" "N" && MOUNT_EXAMS=1 || true
fi

# ── build ────────────────────────────────────────────────────────────────────
IMAGE_EXISTS=0; docker image inspect "$IMAGE" >/dev/null 2>&1 && IMAGE_EXISTS=1
DO_BUILD=1
case "$BUILD_MODE" in
  yes) DO_BUILD=1 ;;
  no)  DO_BUILD=0 ;;
  auto)
    if (( IMAGE_EXISTS )); then
      confirm "Image '$IMAGE' already exists. Rebuild it?" "N" && DO_BUILD=1 || DO_BUILD=0
    else
      DO_BUILD=1
    fi ;;
esac
if (( DO_BUILD )); then
  say "Building image '$IMAGE' (first build compiles better-sqlite3; may take a few minutes)…"
  docker build -t "$IMAGE" "$ROOT"
  ok "Image built."
elif (( ! IMAGE_EXISTS )); then
  die "Image '$IMAGE' does not exist and --no-build was given. Build it first."
else
  warn "Reusing existing image '$IMAGE'."
fi

# ── prepare data target ──────────────────────────────────────────────────────
DATA_ARGS=()
if [[ "$DATA_MODE" == "dir" ]]; then
  mkdir -p "$DATA_DIR"
  DATA_ARGS=(-v "$DATA_DIR:/app/data")
  DATA_DESC="host dir $DATA_DIR"
else
  DATA_ARGS=(-v "certprep-data:/app/data")
  DATA_DESC="named volume 'certprep-data'"
fi

EXAMS_ARGS=()
if (( MOUNT_EXAMS )); then
  EXAMS_ARGS=(-v "$ROOT/Exams:/app/Exams:ro" -v "$ROOT/exam-paths.json:/app/exam-paths.json:ro")
  EXAMS_DESC="bind-mounted from ./Exams (read-only)"
else
  EXAMS_DESC="baked into the image"
fi

# ── (re)start container ──────────────────────────────────────────────────────
if docker ps -aq -f "name=^${CONTAINER}$" | grep -q .; then
  say "Replacing existing container '$CONTAINER'…"
  docker rm -f "$CONTAINER" >/dev/null
fi

say "Starting container '$CONTAINER'…"
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p "127.0.0.1:${PORT}:3000" \
  "${DATA_ARGS[@]}" \
  "${EXAMS_ARGS[@]}" \
  "$IMAGE" >/dev/null
ok "Container started."

# ── wait for health ──────────────────────────────────────────────────────────
URL="http://127.0.0.1:${PORT}"
say "Waiting for the app to become healthy…"
for i in $(seq 1 40); do
  if curl -fsS --max-time 2 "${URL}/api/health" >/dev/null 2>&1; then
    ok "App is up at ${C_G}${URL}${C_0}"
    break
  fi
  if ! docker ps -q -f "name=^${CONTAINER}$" | grep -q .; then
    warn "Container exited early. Logs:"; docker logs --tail 40 "$CONTAINER" || true
    die "Startup failed."
  fi
  sleep 1
  [[ $i -eq 40 ]] && warn "Health check timed out; the app may still be starting. Check: docker logs -f $CONTAINER"
done

# ── summary ──────────────────────────────────────────────────────────────────
printf '\n'
ok "CertPrep is running."
printf '   URL:    %s\n' "$URL"
printf '   data:   %s\n' "$DATA_DESC"
printf '   sets:   %s\n' "$EXAMS_DESC"
printf '\n   Manage it:\n'
printf '     logs:    docker logs -f %s\n' "$CONTAINER"
printf '     stop:    docker stop %s\n' "$CONTAINER"
printf '     start:   docker start %s\n' "$CONTAINER"
printf '     remove:  docker rm -f %s\n' "$CONTAINER"
