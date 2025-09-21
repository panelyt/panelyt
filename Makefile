.PHONY: install-web install-api dev-web dev-api lint-api test-api migrate-api docker-up docker-down fmt-api

UV ?= uv
UV_ENV ?= UV_PROJECT_ENVIRONMENT=.venv UV_CACHE_DIR=.uv-cache

install-web:
	cd apps/web && corepack enable && pnpm install

install-api:
	cd apps/api && $(UV_ENV) $(UV) sync --extra dev

dev-web:
	cd apps/web && corepack enable && pnpm --filter @panelyt/types build && pnpm dev

dev-api:
	cd apps/api && $(UV_ENV) $(UV) run uvicorn panelyt_api.main:app --reload --host 0.0.0.0 --port 8000

lint-api:
	cd apps/api && $(UV_ENV) $(UV) run ruff check src

fmt-api:
	cd apps/api && $(UV_ENV) $(UV) run ruff check src --fix

test-api:
	cd apps/api && $(UV_ENV) $(UV) run pytest

migrate-api:
	cd apps/api && $(UV_ENV) $(UV) run alembic upgrade head

docker-up:
	cd infra && docker compose up --build

docker-down:
	cd infra && docker compose down
