#!/usr/bin/env bash
# ============================================================
# Server-side deploy: bring the checkout to a commit on main, rebuild
# the app image and restart the container, then wait for it to report
# healthy. Run ON the server, normally by .github/workflows/deploy.yml:
#
#   ssh user@host 'DEPLOY_PATH=~/Projects/clinicoro DEPLOY_SHA=<sha> bash -s' < scripts/deploy.sh
#
# It can also be run by hand on the server (DEPLOY_SHA defaults to the
# tip of origin/main).
#
# Why the `docker rm` fallback: the server's docker-compose 1.29 crashes
# with "KeyError: 'ContainerConfig'" when it recreates a container whose
# image was built by a newer Docker. It leaves the old container renamed
# to "<hash>_<project>_app_1"; removing that and running `up` again
# creates the new one cleanly.
# ============================================================
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-$HOME/Projects/clinicoro}"
BRANCH="${DEPLOY_BRANCH:-main}"
SERVICE="${DEPLOY_SERVICE:-app}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

cd "$DEPLOY_PATH"
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
CONTAINER="${PROJECT}_${SERVICE}_1"

echo "==> Fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
SHA="${DEPLOY_SHA:-$(git rev-parse "origin/$BRANCH")}"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "!! The server checkout has local changes to tracked files; refusing to deploy over them." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  echo "==> Switching to $BRANCH"
  git checkout --quiet "$BRANCH" 2>/dev/null || git checkout --quiet -b "$BRANCH" "origin/$BRANCH"
fi
# Fast-forward only: never rewrite history on the server.
git merge --quiet --ff-only "$SHA"
echo "==> At $(git log --oneline -1)"

echo "==> Building $SERVICE"
docker-compose build "$SERVICE"

echo "==> Starting $SERVICE"
if ! docker-compose up -d "$SERVICE"; then
  echo "==> docker-compose up failed; removing the leftover container and retrying"
  docker ps -a --format '{{.Names}}' | grep -E "^[0-9a-f]+_${PROJECT}_${SERVICE}_1$" | xargs -r docker rm -f
  docker-compose up -d "$SERVICE"
fi

echo "==> Waiting for $CONTAINER to be healthy (up to ${HEALTH_TIMEOUT}s)"
for _ in $(seq 1 $((HEALTH_TIMEOUT / 5))); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || echo missing)"
  case "$status" in
    healthy) echo "==> Healthy"; docker image prune -f >/dev/null; exit 0 ;;
    unhealthy|exited|dead|missing) echo "!! $CONTAINER is $status" >&2; docker logs --tail 50 "$CONTAINER" >&2 || true; exit 1 ;;
  esac
  sleep 5
done
echo "!! $CONTAINER did not become healthy in ${HEALTH_TIMEOUT}s" >&2
docker logs --tail 50 "$CONTAINER" >&2 || true
exit 1
