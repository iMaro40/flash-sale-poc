#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Usage: stress-tests/run.sh [light|medium|heavy] [extra k6 args...]
PROFILE="${1:-heavy}"
if [ $# -gt 0 ]; then shift; fi

K6_OUTPUT=$(k6 run "stress-tests/${PROFILE}.js" "$@" 2>&1 | tee /dev/stderr)

PRODUCT_ID=$(echo "$K6_OUTPUT" | grep -oE 'PRODUCT_ID=\S+' | cut -d= -f2 | tr -d '"')
USERS_ATTEMPTED=$(echo "$K6_OUTPUT" | grep -oE 'USERS_ATTEMPTED=\S+' | cut -d= -f2 | tr -d '"')

if [ -z "$PRODUCT_ID" ]; then
  echo "Could not determine product ID from k6 output; skipping integrity check."
  exit 1
fi

(cd backend && npx tsx scripts/integrity-check.ts "$PRODUCT_ID" "$USERS_ATTEMPTED")
