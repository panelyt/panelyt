# Panelyt

Panelyt minimizes the total cost of user-selected biomarkers by blending single blood tests and
packages from diag.pl. The backend ingests the public catalog, stores a 30-day price history in
Postgres, and exposes optimization endpoints. The Next.js frontend lets contributors search
biomarkers, assemble panels, and compare current prices with Panelyt's historical minimum basket.

## Getting started

Install [uv](https://github.com/astral-sh/uv) (for example `curl -LsSf https://astral.sh/uv/install.sh | sh`) and [pnpm](https://pnpm.io/installation).

1. **Install dependencies**
   ```bash
   make install-api   # uv sync --extra dev in apps/api (.venv managed by uv)
   make install-web   # pnpm install in apps/web
   ```
   After syncing backend dependencies, activate the virtual environment before
   running direct `uv` commands:
   ```bash
   source apps/api/.venv/bin/activate
   ```
2. **Run services locally**
   ```bash
   # Start FastAPI (requires Postgres configured via apps/api/.env)
   make dev-api

   # In a separate shell, start the Next.js client
   make dev-web
   ```
3. **Run migrations** (after configuring the database URL in `.env`):
   ```bash
   make migrate-api
   ```

For a containerized setup, copy `infra/.env.example` to `infra/.env`, adjust credentials, and run
`make docker-up`. The compose stack now provisions Postgres, the API, and the Next.js frontend for a
self-contained VPS deployment.

## Project layout

```
apps/
  api/      # FastAPI service: ingestion, optimization, scheduler
  web/      # Next.js client: biomarker search + results UI
packages/
  types/    # Shared Zod schemas for API contracts
infra/
  docker-compose.yml
```

Key specifications and data model details live in `SPEC.md`.

## Backend highlights

- FastAPI + SQLAlchemy + Alembic, backed by Postgres (`panelyt` schema).
- APScheduler triggers ingestion nightly at 03:15 Europe/Oslo and on-demand when data is stale (>3h).
- Ingestion normalizes diag.pl products, stores per-item snapshots, and prunes history beyond 35 days.
- Optimization uses OR-Tools CP-SAT to cover requested biomarkers while minimizing current prices and
  reporting 30-day historical totals.

## Frontend highlights

- Next.js App Router with TanStack Query for data fetching.
- Live biomarker typeahead, chip-based selection, and optimized basket visualization.
- Displays current totals vs. “Panelyt 30-day minimum”, groups chosen items, and surfaces coverage gaps.

## Tests & linting

- Backend: `make lint-api`, `make fmt-api`, `make test-api` (all via `uv run`).
- Frontend: `pnpm --filter @panelyt/web lint` and `pnpm --filter @panelyt/web typecheck`.

Refer to `AGENTS.md` for contributor conventions.
