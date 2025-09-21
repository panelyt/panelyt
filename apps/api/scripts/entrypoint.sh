#!/usr/bin/env sh
set -euo pipefail

uv run alembic upgrade head
exec uv run uvicorn panelyt_api.main:app --host 0.0.0.0 --port 8000
