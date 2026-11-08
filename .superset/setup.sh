#!/usr/bin/env bash
# Prepares a new Paradev/Superset workspace. Safe to re-run.
set -euo pipefail
if [ -f .env ]; then
  echo ".env already present"
elif [ -n "${SUPERSET_ROOT_PATH:-}" ] && [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
  cp "$SUPERSET_ROOT_PATH/.env" .env
  echo "Copied .env from main checkout"
else
  echo "warning: no .env found; Mapbox/LLM features need it" >&2
fi
