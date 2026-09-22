#!/usr/bin/env bash
# Geçici Postgres 17 ile @tower/db entegrasyon testlerini çalıştırır.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "[@tower/db] Docker yok — entegrasyon testleri çalıştırılamadı." >&2
  exit 1
fi

NAME="tower-db-test-$$"
PORT=55432
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tower_test -p "$PORT:5432" postgres:17 >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

READY=""
for _ in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -d tower_test >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ -z "$READY" ]; then
  echo "[@tower/db] Postgres zamanında hazır olmadı — entegrasyon testleri çalıştırılamadı." >&2
  exit 1
fi

TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:$PORT/tower_test" pnpm exec vitest run
