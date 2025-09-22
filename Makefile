.PHONY: help install-web install-api dev-web dev-api lint-api test-api migrate-api docker-up docker-down fmt-api check typecheck-api lint-web typecheck-web test-web

UV ?= uv
UV_ENV ?= UV_PROJECT_ENVIRONMENT=.venv UV_CACHE_DIR=.uv-cache

help: ## Show this help message
	@echo "Available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install-web: ## Install web frontend dependencies
	cd apps/web && corepack enable && pnpm install

install-api: ## Install API backend dependencies
	cd apps/api && $(UV_ENV) $(UV) sync --extra dev

dev-web: ## Start web frontend development server
	cd apps/web && corepack enable && pnpm --filter @panelyt/types build && pnpm dev

dev-api: ## Start API backend development server
	cd apps/api && $(UV_ENV) $(UV) run uvicorn panelyt_api.main:app --reload --host 0.0.0.0 --port 8000

lint-api: ## Run linting checks on API code
	cd apps/api && $(UV_ENV) $(UV) run ruff check src

fmt-api: ## Format and fix API code style
	cd apps/api && $(UV_ENV) $(UV) run ruff check src --fix

test-api: ## Run API test suite
	cd apps/api && DATABASE_URL="sqlite+aiosqlite:///test.db" $(UV_ENV) $(UV) run pytest

migrate-api: ## Run database migrations
	cd apps/api && $(UV_ENV) $(UV) run alembic upgrade head

docker-up: ## Start all services with Docker Compose
	cd infra && docker compose up --build

docker-down: ## Stop all Docker Compose services
	cd infra && docker compose down

typecheck-api: ## Run type checking on API code
	cd apps/api && $(UV_ENV) $(UV) run mypy src

lint-web: ## Run linting checks on web frontend
	cd apps/web && pnpm lint

typecheck-web: ## Run type checking on web frontend
	cd apps/web && pnpm typecheck

test-web: ## Run web frontend test suite (placeholder - not implemented yet)
	@echo "Web tests not implemented yet"

check: ## Run comprehensive code quality checks, tests, and linting for the entire project
	@echo "🔍 Running comprehensive code quality checks..."
	@echo ""
	@echo "📦 Building shared types..."
	cd apps/web && pnpm --filter @panelyt/types build
	@echo ""
	@echo "🔧 API: Type checking..."
	$(MAKE) typecheck-api
	@echo ""
	@echo "🔧 API: Linting..."
	$(MAKE) lint-api
	@echo ""
	@echo "🧪 API: Running tests..."
	$(MAKE) test-api
	@echo ""
	@echo "🌐 Web: Type checking..."
	$(MAKE) typecheck-web
	@echo ""
	@echo "🌐 Web: Linting..."
	$(MAKE) lint-web
	@echo ""
	@echo "✅ All checks completed successfully!"
