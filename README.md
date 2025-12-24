# Panelyt

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-panelyt-black?logo=github)](https://github.com/panelyt/panelyt)

Panelyt minimizes the total cost of user-selected biomarkers by blending single blood tests and packages from diag.pl. The backend ingests the public catalog, stores a 30-day price history in Postgres, and exposes optimization endpoints. The Next.js frontend lets contributors search biomarkers, assemble panels, and compare current prices with Panelyt's historical minimum basket.

## Requirements

- Python 3.11+
- Node.js 20+
- [uv](https://github.com/astral-sh/uv) for Python dependency management
- [pnpm](https://pnpm.io/installation) for Node.js dependency management

## Getting started

1. **Install dependencies**
   ```bash
   make install-api   # uv sync in apps/api
   make install-web   # pnpm install in apps/web
   make install-bot   # uv sync in apps/telegram-bot
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

For a containerized setup, copy `infra/.env.example` to `infra/.env`, adjust credentials, and run `make docker-up`. The compose stack now provisions Postgres, the API, and the Next.js frontend for a self-contained VPS deployment.

## Project layout

```
apps/
  api/           # FastAPI service: ingestion, optimization, scheduler
  web/           # Next.js client: biomarker search + results UI
  telegram-bot/  # Telegram bot for account linking and alerts
packages/
  types/         # Shared Zod schemas for API contracts
infra/
  docker-compose.yml
```

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

- API: `make lint-api`, `make fmt-api`, `make test-api`
- Web: `make lint-web`, `make typecheck-web`, `make test-web`
- Bot: `make lint-bot`, `make typecheck-bot`

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

To report vulnerabilities, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
