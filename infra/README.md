# Panelyt VPS deployment

This directory contains the self-contained Docker Compose stack used for VPS deployments.

## Quick start

1. Copy `.env.example` to `.env` and update the values:
   - change `PANELYT_DB_PASSWORD` (and the matching password in `PANELYT_DATABASE_URL`)
   - set `PANELYT_PUBLIC_API_URL` to the public URL that browsers should use, e.g. `https://panelyt.example.com/api`
   - extend `PANELYT_CORS_ORIGINS` with the web origin(s) that will hit the API
2. Build and start the stack:
   ```bash
   cd infra
   docker compose up -d --build
   ```
   or from the repository root:
   ```bash
   make docker-up
   ```
3. Check container health:
   ```bash
   docker compose ps
   docker compose logs api
   ```

`docker compose down` (or `make docker-down`) stops the stack but preserves the `panelyt_db_data`
volume so Postgres data survives restarts. To reset the database remove that volume manually.

## Services

- **db** – PostgreSQL 16 with a persistent named volume.
- **api** – FastAPI + Alembic migrations + initial ingestion start-up script.
- **web** – Next.js standalone server, built with the public API URL baked in and an internal URL for server-side fetches.

All services share the default Compose network. The API exposes port `PANELYT_API_PORT` (default
`8002`) and the frontend exposes `PANELYT_WEB_PORT` (default `3002`).
