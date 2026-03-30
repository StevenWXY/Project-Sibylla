#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Sibylla Integration Test Runner
#
# Orchestrates the full E2E integration test suite:
#   1. Start Docker test infrastructure (Postgres, Redis, Gitea)
#   2. Run cloud integration tests (Auth workflow)
#   3. Run desktop integration tests (Sync workflow)
#   4. Tear down Docker infrastructure
#
# Usage:
#   ./scripts/run-integration-tests.sh
#
# Prerequisites:
#   - Docker and Docker Compose v2 installed
#   - Node.js >= 20 installed
#   - npm dependencies installed in both sibylla-cloud/ and sibylla-desktop/
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUD_DIR="$PROJECT_ROOT/sibylla-cloud"
DESKTOP_DIR="$PROJECT_ROOT/sibylla-desktop"

# Track overall exit code
EXIT_CODE=0

echo "============================================"
echo " Sibylla Integration Test Suite"
echo "============================================"
echo ""

# ─── Step 1: Start Docker test infrastructure ───────────────────────

echo "[1/4] Starting Docker test infrastructure..."
cd "$CLOUD_DIR"
docker compose -f docker-compose.test.yml up -d --wait 2>&1 || {
  echo "ERROR: Failed to start Docker test containers."
  echo "       Make sure Docker is running and ports 54321, 63791, 30011 are free."
  exit 1
}
echo "      Docker containers started."
echo ""

# ─── Ensure cleanup on exit ─────────────────────────────────────────

cleanup() {
  echo ""
  echo "[4/4] Tearing down Docker test infrastructure..."
  cd "$CLOUD_DIR"
  docker compose -f docker-compose.test.yml down -v 2>&1 || true
  echo "      Docker containers removed."
  echo ""
  echo "============================================"
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo " All integration tests PASSED"
  else
    echo " Some integration tests FAILED (exit code: $EXIT_CODE)"
  fi
  echo "============================================"
  exit "$EXIT_CODE"
}
trap cleanup EXIT

# ─── Step 1b: Create Gitea admin user ───────────────────────────────
# Gitea does NOT auto-create admin users from env vars.
# We must create it via CLI after the container is healthy.

echo "      Creating Gitea admin user..."
docker exec --user git sibylla-gitea-test gitea admin user create \
  --admin \
  --username sibylla-test-admin \
  --password test-admin-password-123 \
  --email admin@sibylla-test.local \
  --must-change-password=false 2>&1 || {
  # If user already exists (exit code 1 with "already exists"), that's fine
  echo "      (Admin user may already exist — continuing)"
}
echo "      Gitea admin user ready."
echo ""

# ─── Step 2: Run cloud integration tests ────────────────────────────

echo "[2/4] Running cloud integration tests (Auth Workflow)..."
cd "$CLOUD_DIR"
if npx vitest run --config vitest.integration.config.ts 2>&1; then
  echo "      Cloud integration tests PASSED."
else
  echo "      Cloud integration tests FAILED."
  EXIT_CODE=1
fi
echo ""

# ─── Step 3: Run desktop integration tests ──────────────────────────

echo "[3/4] Running desktop integration tests (Sync Workflow)..."
cd "$DESKTOP_DIR"
if npx vitest run --config vitest.integration.config.ts 2>&1; then
  echo "      Desktop integration tests PASSED."
else
  echo "      Desktop integration tests FAILED."
  EXIT_CODE=1
fi
echo ""
