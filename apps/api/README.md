# Panelyt API

FastAPI service that ingests the diag.pl catalog, stores a 30-day price history, and exposes
optimization endpoints for the frontend. See `SPEC.md` for architecture details.

## Setup

Install [uv](https://github.com/astral-sh/uv) and run:

```bash
cd apps/api
UV_PROJECT_ENVIRONMENT=.venv uv sync --extra dev
```

This creates `.venv/` managed by uv and installs dev tooling (pytest, ruff, etc.).

## Common commands

Run all tooling via `uv run` so the managed environment is used:

```bash
UV_PROJECT_ENVIRONMENT=.venv uv run uvicorn panelyt_api.main:app --reload
UV_PROJECT_ENVIRONMENT=.venv uv run alembic upgrade head
UV_PROJECT_ENVIRONMENT=.venv uv run pytest
UV_PROJECT_ENVIRONMENT=.venv uv run ruff check src
```

The repository Makefile wraps these commands (e.g. `make dev-api`, `make test-api`).
