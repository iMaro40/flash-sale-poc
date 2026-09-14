#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Usage: stress-tests/run.sh [light|medium|heavy] [extra k6 args...]
PROFILE="${1:-heavy}"
if [ $# -gt 0 ]; then shift; fi

# Cumulative Redis counters (calls=, keyspace hits/misses) so we can diff before/after the run.
# `|| true` guards against grep finding no match (e.g. cmdstat not seen yet), which would
# otherwise kill the script immediately under `set -o pipefail`.
redis_cmdstat_calls() {
  docker exec flash-sale-redis redis-cli INFO commandstats 2>/dev/null \
    | grep "^cmdstat_$1:" | sed -E 's/^cmdstat_[a-z_]+:calls=([0-9]+).*/\1/' || true
}
redis_stat() {
  docker exec flash-sale-redis redis-cli INFO stats 2>/dev/null \
    | grep "^$1:" | cut -d: -f2 | tr -d '\r' || true
}

REDIS_EVALSHA_BEFORE=$(redis_cmdstat_calls evalsha)
REDIS_EVALSHA_BEFORE=${REDIS_EVALSHA_BEFORE:-0}
REDIS_EVAL_BEFORE=$(redis_cmdstat_calls eval)
REDIS_EVAL_BEFORE=${REDIS_EVAL_BEFORE:-0}
REDIS_HITS_BEFORE=$(redis_stat keyspace_hits)
REDIS_HITS_BEFORE=${REDIS_HITS_BEFORE:-0}
REDIS_MISSES_BEFORE=$(redis_stat keyspace_misses)
REDIS_MISSES_BEFORE=${REDIS_MISSES_BEFORE:-0}

MONITOR_CSV="stress-tests/.monitor-samples.csv"
./stress-tests/monitor.sh "$MONITOR_CSV" &
MONITOR_PID=$!
trap 'kill "$MONITOR_PID" 2>/dev/null || true' EXIT

K6_OUTPUT=$(k6 run "stress-tests/${PROFILE}.js" "$@" 2>&1 | tee /dev/stderr)

kill "$MONITOR_PID" 2>/dev/null || true
trap - EXIT

REDIS_EVALSHA_AFTER=$(redis_cmdstat_calls evalsha)
REDIS_EVALSHA_AFTER=${REDIS_EVALSHA_AFTER:-0}
REDIS_EVAL_AFTER=$(redis_cmdstat_calls eval)
REDIS_EVAL_AFTER=${REDIS_EVAL_AFTER:-0}
REDIS_HITS_AFTER=$(redis_stat keyspace_hits)
REDIS_HITS_AFTER=${REDIS_HITS_AFTER:-0}
REDIS_MISSES_AFTER=$(redis_stat keyspace_misses)
REDIS_MISSES_AFTER=${REDIS_MISSES_AFTER:-0}

REDIS_EVAL_CALLS=$(( (REDIS_EVALSHA_AFTER - REDIS_EVALSHA_BEFORE) + (REDIS_EVAL_AFTER - REDIS_EVAL_BEFORE) ))
REDIS_HITS=$(( REDIS_HITS_AFTER - REDIS_HITS_BEFORE ))
REDIS_MISSES=$(( REDIS_MISSES_AFTER - REDIS_MISSES_BEFORE ))

PRODUCT_ID=$(echo "$K6_OUTPUT" | grep -oE 'PRODUCT_ID=\S+' | cut -d= -f2 | tr -d '"')
USERS_ATTEMPTED=$(echo "$K6_OUTPUT" | grep -oE 'USERS_ATTEMPTED=\S+' | cut -d= -f2 | tr -d '"')

if [ -z "$PRODUCT_ID" ]; then
  echo "Could not determine product ID from k6 output; skipping integrity check."
  exit 1
fi

(cd backend && npx tsx scripts/integrity-check.ts "$PRODUCT_ID" "$USERS_ATTEMPTED")

# Postgres side: how many rows the purchase path actually wrote, and whether any are duplicates/stuck pending.
PG_STATUS_COUNTS=$(docker exec flash-sale-postgres psql -U postgres -d flash_sale -t -A \
  -c "SELECT status, count(*) FROM transactions WHERE product_id = '${PRODUCT_ID}' GROUP BY status;" 2>/dev/null)
PG_DUPLICATE_BUYERS=$(docker exec flash-sale-postgres psql -U postgres -d flash_sale -t -A \
  -c "SELECT count(*) FROM (SELECT user_id FROM transactions WHERE product_id = '${PRODUCT_ID}' GROUP BY user_id HAVING count(*) > 1) d;" 2>/dev/null | tr -d '[:space:]')

PG_COMPLETED=0
PG_PENDING=0
while IFS='|' read -r status count; do
  case "$status" in
    COMPLETED) PG_COMPLETED=$count ;;
    PENDING) PG_PENDING=$count ;;
  esac
done <<< "$PG_STATUS_COUNTS"

cat > stress-tests/.last-verification.json <<EOF
{
  "redisReservationCalls": ${REDIS_EVAL_CALLS},
  "redisKeyspaceHits": ${REDIS_HITS},
  "redisKeyspaceMisses": ${REDIS_MISSES},
  "postgresTransactionsCompleted": ${PG_COMPLETED:-0},
  "postgresTransactionsPending": ${PG_PENDING:-0},
  "postgresDuplicateBuyers": ${PG_DUPLICATE_BUYERS:-0}
}
EOF

node stress-tests/report.js "$PROFILE"
