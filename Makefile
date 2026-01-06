# Standard Makefile (portable)
# Fill in *_CMD variables or replace the recipes with project-specific commands.

UV ?= uv
UV_ENV ?= UV_PROJECT_ENVIRONMENT=.venv UV_CACHE_DIR=.uv-cache
PNPM ?= corepack pnpm

SETUP_CMD ?= (cd apps/api && $(UV_ENV) $(UV) sync --extra dev) && 	(cd apps/web && corepack enable && $(PNPM) install) && 	(cd apps/telegram-bot && $(UV_ENV) $(UV) sync --extra dev)
BUILD_CMD ?= (cd apps/web && $(PNPM) --filter @panelyt/types build)
TEST_CMD ?= $(MAKE) test-api && $(MAKE) test-web
LINT_CMD ?= $(MAKE) typecheck-api && $(MAKE) lint-api && 	$(MAKE) typecheck-bot && $(MAKE) lint-bot && 	$(MAKE) typecheck-web && $(MAKE) lint-web
FMT_CMD ?= $(MAKE) fmt-api
CLEAN_CMD ?= rm -rf 	apps/api/.pytest_cache apps/api/.mypy_cache apps/api/.ruff_cache 	apps/telegram-bot/.pytest_cache apps/telegram-bot/.mypy_cache apps/telegram-bot/.ruff_cache 	apps/web/.next apps/web/out apps/web/build

.PHONY: help setup build test lint fmt clean verify 	install-web install-api install-bot 	dev-web dev-api dev-bot 	lint-api test-api migrate-api ingest-api 	docker-up docker-down fmt-api check typecheck-api 	lint-web typecheck-web test-web 	lint-bot typecheck-bot

help:
	@printf "%s\n" "Available targets:" \
		"  setup         Install dependencies" \
		"  build         Build shared artifacts (types)" \
		"  test          Run all tests (api + web)" \
		"  lint          Run lint + typecheck across api/web/bot" \
		"  fmt           Auto-format API code" \
		"  clean         Remove build artifacts and caches" \
		"  verify        Run build + test + lint + fmt (fail fast)" \
		"" \
		"  install-api   Install API backend dependencies" \
		"  install-web   Install web frontend dependencies" \
		"  install-bot   Install Telegram bot dependencies" \
		"  dev-api       Start API backend development server" \
		"  dev-web       Start web frontend development server" \
		"  dev-bot       Run Telegram bot locally with long polling" \
		"  lint-api      Run linting checks on API code" \
		"  fmt-api       Format and fix API code style" \
		"  typecheck-api Run type checking on API code" \
		"  test-api      Run API test suite" \
		"  lint-web      Run linting checks on web frontend" \
		"  typecheck-web Run type checking on web frontend" \
		"  test-web      Run web frontend test suite" \
		"  lint-bot      Run linting checks on Telegram bot code" \
		"  typecheck-bot Run type checking on Telegram bot code" \
		"  migrate-api   Run database migrations" \
		"  ingest-api    Run data ingestion for the API" \
		"  docker-up     Start all services with Docker Compose" \
		"  docker-down   Stop all Docker Compose services" \
		"  check         Run full suite (alias for verify)"

setup:
	@if [ -n "$(SETUP_CMD)" ]; then \
		$(SETUP_CMD); \
	else \
		printf "%s\n" "setup: SETUP_CMD not set"; \
		exit 1; \
	fi

build:
	@if [ -n "$(BUILD_CMD)" ]; then \
		$(BUILD_CMD); \
	else \
		printf "%s\n" "build: BUILD_CMD not set"; \
		exit 1; \
	fi

test:
	@if [ -n "$(TEST_CMD)" ]; then \
		$(TEST_CMD); \
	else \
		printf "%s\n" "test: TEST_CMD not set"; \
		exit 1; \
	fi

lint:
	@if [ -n "$(LINT_CMD)" ]; then \
		$(LINT_CMD); \
	else \
		printf "%s\n" "lint: LINT_CMD not set"; \
		exit 1; \
	fi

fmt:
	@if [ -n "$(FMT_CMD)" ]; then \
		$(FMT_CMD); \
	else \
		printf "%s\n" "fmt: FMT_CMD not set"; \
		exit 1; \
	fi

clean:
	@if [ -n "$(CLEAN_CMD)" ]; then \
		$(CLEAN_CMD); \
	else \
		printf "%s\n" "clean: CLEAN_CMD not set"; \
		exit 1; \
	fi

verify:
	@$(MAKE) build
	@$(MAKE) test
	@$(MAKE) lint
	@$(MAKE) fmt

install-web:
	cd apps/web && corepack enable && $(PNPM) install

install-api:
	cd apps/api && $(UV_ENV) $(UV) sync --extra dev

install-bot:
	cd apps/telegram-bot && $(UV_ENV) $(UV) sync --extra dev

dev-web:
	cd apps/web && $(PNPM) --filter @panelyt/types build && $(PNPM) dev

dev-api:
	cd apps/api && $(UV_ENV) $(UV) run uvicorn panelyt_api.main:app --reload --host 0.0.0.0 --port 8000 --reload-dir src

dev-bot:
	cd apps/telegram-bot && $(UV_ENV) $(UV) run panelyt-telegram-bot

lint-api:
	cd apps/api && $(UV_ENV) $(UV) run ruff check src

fmt-api:
	cd apps/api && $(UV_ENV) $(UV) run ruff check src --fix

test-api:
	cd apps/api && DATABASE_URL="sqlite+aiosqlite:///test.db" $(UV_ENV) $(UV) run pytest

migrate-api:
	cd apps/api && $(UV_ENV) $(UV) run alembic upgrade head

ingest-api:
	cd apps/api && $(UV_ENV) $(UV) run python scripts/run_ingestion.py

docker-up:
	cd infra && docker compose up --build

docker-down:
	cd infra && docker compose down

typecheck-api:
	cd apps/api && $(UV_ENV) $(UV) run mypy src

lint-web:
	cd apps/web && $(PNPM) lint

typecheck-web:
	cd apps/web && $(PNPM) typecheck

test-web:
	cd apps/web && $(PNPM) --filter @panelyt/web test:run

lint-bot:
	cd apps/telegram-bot && $(UV_ENV) $(UV) run ruff check src

typecheck-bot:
	cd apps/telegram-bot && $(UV_ENV) $(UV) run mypy src

check:
	@$(MAKE) verify
