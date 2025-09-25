# Repository Guidelines

## Project Structure & Module Organization
Panelyt splits runtime apps under `apps/` and shared code under `packages/`. `apps/api` contains the FastAPI service (ingestion, optimization, scheduler) with source in `apps/api/src/panelyt_api` plus Alembic migrations in `apps/api/alembic`. `apps/web` holds the Next.js 15 App Router client with standalone builds; its UI lives under `apps/web/src` with Tailwind styling via `globals.css`. Shared API contracts and Zod schemas live in `packages/types`. Infrastructure assets, including the production Docker Compose setup, live in `infra/`.

## Build, Test, and Development Commands
Use `uv` for every Python workflow. Run `make help` to see all available commands. Key commands:
- `make install-api` runs `uv sync --extra dev` (creates `.venv/`; activate it with
  `source apps/api/.venv/bin/activate` before running raw `uv` commands)
- `make dev-api` starts FastAPI development server on port 8000
- `make dev-web` starts Next.js development server on port 3000
- `make docker-up` builds and starts production containers (API on 8002, Web on 3002)
- `make migrate-api` runs database migrations
- `make test-api` runs pytest test suite
- `make lint-api` runs ruff linting
- `make fmt-api` auto-fixes code style issues

All backend commands should run through `uv run` after activating the virtualenv. Frontend
dependencies use pnpm via `make install-web`.

## Production Deployment
The system is designed for zero-touch production deployment with Docker:

1. **Automatic Data Ingestion**: Containers auto-populate database on first startup from diag.pl API
2. **Scheduled Updates**: Daily ingestion runs at 3:15 AM with smart staleness detection
3. **Health Monitoring**: Built-in health checks (`/health`, `/healthz`)
4. **Database Migrations**: Auto-run during container startup
5. **Biomarker Aliases**: Import system supports Polish common names, English translations, abbreviations

### Docker Compose Setup
- **API Container**: Runs on port 8002, connects to external PostgreSQL via `shared-db` network
- **Web Container**: Runs on port 3002, standalone Next.js build with correct API URLs
- **Environment**: Configure via `apps/api/.env` with proper database credentials and CORS origins
- **Networks**: API accessible on both `shared-db` (for PostgreSQL) and `default` (for external access)

## Data Management
- **Database**: PostgreSQL with `panelyt` schema, managed via Alembic migrations (tests default to
  SQLite + aiosqlite)
- **Ingestion Service**: Fetches from diag.pl API, stores biomarkers, items, and 30-day price history
- **Search System**: Exact elab_code matching with fallback fuzzy search across biomarker names and aliases
- **Price Tracking**: Daily snapshots for cost optimization analysis

## Coding Style & Naming Conventions
Backend modules follow SQLAlchemy 2.0 typing with `Mapped[...]` columns and `snake_case` APIs. Keep business logic in `services/` and repository logic in `ingest/`. Frontend components are functional React with hooks, 2-space indentation, and Tailwind utility ordering of layout → spacing → typography → state. Shared types should be added to `packages/types` and referenced via `@panelyt/types` to keep client/server contracts in sync.

## Testing Guidelines
Backend tests live under `apps/api/tests` and use `pytest` (always via `uv run`). Unit tests should
cover optimization pruning, ingestion transforms, and schema validation. Run them with
`make test-api` (uses SQLite via aiosqlite). The API includes a `TESTING` flag in settings for test
database configuration. Frontend checks rely on Vitest + Testing Library under
`apps/web/src/__tests__`; use `pnpm --filter @panelyt/web lint` and `pnpm --filter @panelyt/web typecheck`.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) and keep migrations, schema changes, and application code together. PRs should describe user impact, list test output (pytest/tsc/lint), and include screenshots or cURL samples when touching UI or API responses. Reference relevant sections of `SPEC.md` or `AGENTS.md` in PR descriptions to help reviewers navigate context.

### Git workflow & discipline

- Always create ephemeral `feat/...` branches for feature or fix work. Keep `master` fast-forward clean and merge via fast-forward once checks pass.
- When branching, immediately switch with `git checkout -b feat/<topic>` and clean up with `git branch -d feat/<topic>` after merging.
- Stage intentionally; verify changes with `git diff --staged` before each commit.
- Use Conventional Commit messages to describe intent, e.g. `feat(search): ...` or `fix(api): ...`; keep summaries ≤50 chars and add wrapped bodies for context.
- Run `make check` (build, lint, typecheck, tests) prior to every commit; fix lint errors or ruff import sorting locally before pushing.
- Merge branches only after `make check` succeeds; prefer fast-forward merges to avoid unnecessary merge commits.
- Remove feature branches after merging to keep the branch list tidy.

### Working with GitHub issues via `gh`

- Inspect issue context first: `gh issue view <number>` provides description, labels, and helps scope the work.
- Branch from `master` using the issue topic, e.g. `git checkout -b feat/<short-issue-slug>`; keep the name aligned with the planned change.
- After implementing changes, stage intentionally and confirm with `git diff --staged`; commit using Conventional Commit syntax that reflects the affected area (`feat(alerts): ...`).
- Run `make check` before every commit and again prior to opening a PR so the PR body can list the full test command (e.g. `- make check`).
- Push the feature branch and create the PR with `gh pr create`, including a concise summary, testing section, and `Closes #<issue>` line to auto-link the issue.
- Use `gh`'s output URL to share or revisit the PR; keep the branch synced until review is complete.

## API Architecture
- **FastAPI**: Modern async Python web framework with automatic OpenAPI docs
- **Database Session Management**: Async SQLAlchemy with proper lifecycle management
- **CORS**: Configured for cross-origin requests from frontend domains
- **Health Checks**: Multiple endpoints for Docker health monitoring
- **Scheduler Integration**: APScheduler for background ingestion tasks
- **Error Handling**: Structured logging and proper exception management
- All tasks must be finished with running the `make check` command and fixing its output.
