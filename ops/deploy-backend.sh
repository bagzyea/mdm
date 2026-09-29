#!/usr/bin/env bash
# Build, migrate and (re)start the MDM backend container.
#
# This host has no `docker compose`, so this does with plain docker what
# docker-compose.dev.yml describes. Safe to re-run: it rebuilds the image, applies any
# pending migrations, then replaces the container. Settings come from ops/backend.env
# (not committed; see ops/backend.env.example).
#
#   ops/deploy-backend.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO/ops/backend.env"
NAME=mdm-mdm-backend-1
NETWORK=mdm_default
TAG="mdm-backend:$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || date +%s)"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy ops/backend.env.example)"; exit 1; }

echo "==> Building $TAG"
docker build -f "$REPO/backend/Dockerfile" -t "$TAG" -t mdm-backend:latest "$REPO"

echo "==> Applying database migrations"
docker run --rm --network "$NETWORK" --env-file "$ENV_FILE" "$TAG" npx prisma migrate deploy

echo "==> Replacing container $NAME"
docker rm -f "$NAME" >/dev/null 2>&1 || true
# The source is bind-mounted so edits under backend/ hot-reload (nodemon), as before.
# node_modules and the built shared contract come from the image.
docker run -d --name "$NAME" \
  --network "$NETWORK" --network-alias mdm-backend \
  --restart unless-stopped \
  -p 5001:5001 \
  --env-file "$ENV_FILE" \
  -v "$REPO/backend:/repo/backend" \
  -v /repo/backend/node_modules \
  --health-cmd "wget -q --spider http://localhost:5001/health || exit 1" \
  --health-interval 30s --health-timeout 10s --health-retries 3 --health-start-period 40s \
  "$TAG" >/dev/null

echo "==> Waiting for health"
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo starting)
  [ "$status" = healthy ] && { echo "healthy"; exit 0; }
  sleep 2
done
echo "Backend did not become healthy; recent logs:"; docker logs --tail 50 "$NAME"; exit 1
