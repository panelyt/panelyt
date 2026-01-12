# Standard Justfile template
# List available recipes with: just --list

uv := "uv"
uv_env := "UV_PROJECT_ENVIRONMENT=.venv UV_CACHE_DIR=.uv-cache"
pnpm := "corepack pnpm"

clean_cmd := "rm -rf apps/api/.pytest_cache apps/api/.mypy_cache apps/api/.ruff_cache apps/telegram-bot/.pytest_cache apps/telegram-bot/.mypy_cache apps/telegram-bot/.ruff_cache apps/web/.next apps/web/out apps/web/build"

# default: list available recipes
default:
  @just --list

# setup: install dependencies or prepare tooling
setup:
  @cd apps/api && {{uv_env}} {{uv}} sync --extra dev
  @cd apps/web && {{pnpm}} install
  @cd apps/telegram-bot && {{uv_env}} {{uv}} sync --extra dev

# install: install dependencies (target=api|web|bot|all)
install target="all":
  @case "{{target}}" in \
    api) just _install-api ;; \
    web) just _install-web ;; \
    bot) just _install-bot ;; \
    all|"") just _install-api && just _install-web && just _install-bot ;; \
    *) echo "error: unknown install target '{{target}}' (use api, web, bot, all)" >&2; exit 2 ;; \
  esac

# build: compile, bundle, or build artifacts
build:
  @cd apps/web && {{pnpm}} --filter @panelyt/types build

# dev: start dev servers (target=api|web|bot)
dev target="":
  @case "{{target}}" in \
    api) just _dev-api ;; \
    web) just _dev-web ;; \
    bot) just _dev-bot ;; \
    all|"") echo "error: dev requires explicit target (use api, web, bot)" >&2; exit 2 ;; \
    *) echo "error: unknown dev target '{{target}}' (use api, web, bot)" >&2; exit 2 ;; \
  esac

# test: run the test suite (target=api|web|bot|all, optional args supported)
test target="all" args="":
  @case "{{target}}" in \
    api) just _test-api {{args}} ;; \
    web) just _test-web {{args}} ;; \
    all|"") just _test-api {{args}} && just _test-web {{args}} ;; \
    bot) echo "error: test target 'bot' is not supported" >&2; exit 2 ;; \
    *) echo "error: unknown test target '{{target}}' (use api, web, bot, all)" >&2; exit 2 ;; \
  esac

# lint: run static analysis and style checks (target=api|web|bot|all, optional args supported)
lint target="all" args="":
  @case "{{target}}" in \
    api) just _typecheck-api && just _lint-api {{args}} ;; \
    bot) just _typecheck-bot && just _lint-bot {{args}} ;; \
    web) just _typecheck-web && just _lint-web {{args}} ;; \
    all|"") just _typecheck-api && just _lint-api {{args}} && just _typecheck-bot && just _lint-bot {{args}} && just _typecheck-web && just _lint-web {{args}} ;; \
    *) echo "error: unknown lint target '{{target}}' (use api, web, bot, all)" >&2; exit 2 ;; \
  esac

# fmt: apply auto-formatters (target=api|web|bot|all, optional args supported)
fmt target="all" args="":
  @case "{{target}}" in \
    api|all|"") just _fmt-api {{args}} ;; \
    web|bot) echo "error: fmt target '{{target}}' is not supported" >&2; exit 2 ;; \
    *) echo "error: unknown fmt target '{{target}}' (use api, web, bot, all)" >&2; exit 2 ;; \
  esac

# clean: remove generated artifacts and caches
clean:
  @{{clean_cmd}}

# check: run build -> test -> lint -> fmt sequentially
check: build test lint fmt

# _install-web: install web dependencies
_install-web:
  @cd apps/web && {{pnpm}} install

# _install-api: install api dependencies
_install-api:
  @cd apps/api && {{uv_env}} {{uv}} sync --extra dev

# _install-bot: install bot dependencies
_install-bot:
  @cd apps/telegram-bot && {{uv_env}} {{uv}} sync --extra dev

# _dev-web: start web dev server
_dev-web:
  @cd apps/web && {{pnpm}} --filter @panelyt/types build && {{pnpm}} dev

# _dev-api: start api dev server
_dev-api:
  @cd apps/api && {{uv_env}} {{uv}} run uvicorn panelyt_api.main:app --reload --host 0.0.0.0 --port 8000 --reload-dir src

# _dev-bot: start bot in dev mode
_dev-bot:
  @cd apps/telegram-bot && {{uv_env}} {{uv}} run panelyt-telegram-bot

# _lint-api: run api lints (optional args supported)
_lint-api args="":
  @cd apps/api && {{uv_env}} {{uv}} run --extra dev ruff check src {{args}}

# _fmt-api: format api code (optional args supported)
_fmt-api args="":
  @cd apps/api && {{uv_env}} {{uv}} run --extra dev ruff check src --fix {{args}}

# _test-api: run api tests (optional args supported)
_test-api args="":
  @cd apps/api && DATABASE_URL="sqlite+aiosqlite:///test.db" {{uv_env}} {{uv}} run --extra dev pytest {{args}}

# migrate: run api migrations
migrate:
  @cd apps/api && {{uv_env}} {{uv}} run alembic upgrade head

# ingest-api: run api ingestion script
ingest-api:
  @cd apps/api && {{uv_env}} {{uv}} run python scripts/run_ingestion.py

# docker-up: start docker stack
docker-up:
  @cd infra && docker compose up --build

# docker-down: stop docker stack
docker-down:
  @cd infra && docker compose down

# _typecheck-api: typecheck api code
_typecheck-api:
  @cd apps/api && {{uv_env}} {{uv}} run --extra dev mypy src

# _lint-web: lint web app (optional args supported)
_lint-web args="":
  @cd apps/web && {{pnpm}} lint {{args}}

# _typecheck-web: typecheck web app
_typecheck-web:
  @cd apps/web && {{pnpm}} typecheck

# _test-web: run web tests (optional args supported)
_test-web args="":
  @cd apps/web && {{pnpm}} --filter @panelyt/web test:run {{args}}

# _lint-bot: lint bot code (optional args supported)
_lint-bot args="":
  @cd apps/telegram-bot && {{uv_env}} {{uv}} run --extra dev ruff check src {{args}}

# _typecheck-bot: typecheck bot code
_typecheck-bot:
  @cd apps/telegram-bot && {{uv_env}} {{uv}} run --extra dev mypy src
