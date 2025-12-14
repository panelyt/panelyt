# AGENTS.md

All backend commands should run through `uv run` after activating the virtualenv. Frontend
dependencies use pnpm via `make install-web`.

## Testing Guidelines
Backend tests live under `apps/api/tests` and use `pytest` (always via `uv run`). Unit tests should cover optimization pruning, ingestion transforms, and schema validation. Run them with `make test-api` (uses SQLite via aiosqlite). The API includes a `TESTING` flag in settings for test database configuration. Frontend checks rely on Vitest + Testing Library under `apps/web/src/__tests__`; use `pnpm --filter @panelyt/web lint` and `pnpm --filter @panelyt/web typecheck`.

## Commit & Pull Request Guidelines
Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`) and keep migrations, schema changes, and application code together. PRs should describe user impact, list test output (pytest/tsc/lint), and include screenshots or cURL samples when touching UI or API responses.
