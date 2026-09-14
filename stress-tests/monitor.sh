#!/usr/bin/env bash
# Samples Node/Postgres/Redis stats once a second while a stress test runs.
# Usage: monitor.sh <output-csv-path>
set -uo pipefail

OUT_FILE="$1"
PORT="${PORT:-3000}"

: > "$OUT_FILE"

while true; do
  NODE_PID=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n1)
  if [ -n "${NODE_PID:-}" ]; then
    NODE_STATS=$(ps -o %cpu=,rss= -p "$NODE_PID" 2>/dev/null | awk '{print $1","$2}')
  fi
  NODE_STATS="${NODE_STATS:-0,0}"

  PG_ACTIVE=$(docker exec flash-sale-postgres psql -U postgres -d flash_sale -t -A \
    -c "SELECT count(*) FROM pg_stat_activity WHERE datname='flash_sale' AND state='active';" 2>/dev/null | tr -d '[:space:]')
  PG_LOCK_WAITS=$(docker exec flash-sale-postgres psql -U postgres -d flash_sale -t -A \
    -c "SELECT count(*) FROM pg_locks WHERE NOT granted;" 2>/dev/null | tr -d '[:space:]')

  REDIS_STATS=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" flash-sale-redis 2>/dev/null)
  REDIS_CPU=$(echo "$REDIS_STATS" | cut -d, -f1 | tr -d '%')
  REDIS_MEM=$(echo "$REDIS_STATS" | cut -d, -f2 | cut -d/ -f1 | tr -d ' ')

  echo "${NODE_STATS},${PG_ACTIVE:-0},${PG_LOCK_WAITS:-0},${REDIS_CPU:-0},${REDIS_MEM:-n/a}" >> "$OUT_FILE"

  sleep 1
done
