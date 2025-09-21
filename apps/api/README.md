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

## Production Deployment

### Prerequisites
- External PostgreSQL database running (your shared-db)
- Docker and Docker Compose installed

### Database Setup

1. **Create database and user in your PostgreSQL:**
```sql
CREATE DATABASE panelyt;
CREATE USER panelyt_app WITH PASSWORD 'your_password';
CREATE SCHEMA panelyt;
GRANT ALL PRIVILEGES ON DATABASE panelyt TO panelyt_app;
GRANT ALL PRIVILEGES ON SCHEMA panelyt TO panelyt_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA panelyt TO panelyt_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA panelyt TO panelyt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA panelyt GRANT ALL ON TABLES TO panelyt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA panelyt GRANT ALL ON SEQUENCES TO panelyt_app;
```

2. **Configure environment:**
```bash
# Copy and edit the environment file
cp apps/api/.env.example apps/api/.env
# Update DATABASE_URL with your credentials
```

3. **Deploy with Docker:**
```bash
cd infra
docker compose up -d --build
```

4. **Import biomarker aliases:**
```bash
# Access the API container
docker exec -it infra-api-1 bash
# Import aliases
uv run scripts/import_aliases.py data/core_aliases.json
```

### Biomarker Aliases

The system supports searching biomarkers by alternative names (aliases). The core aliases dataset includes:

- **Polish common names**: "cukier" → "Glukoza", "tarczyca" → "TSH"
- **English translations**: "glucose" → "Glukoza", "thyroid" → "TSH"
- **Abbreviations**: "B12" → "Witamina B12", "Fe" → "Żelazo"
- **Scientific names**: "ferritin" → "Ferrytyna"

#### Adding Custom Aliases

Create a JSON file with the following format:

```json
{
  "biomarker_name_or_elab_code": {
    "aliases": [
      {"alias": "alternative_name", "type": "common_name", "priority": 1},
      {"alias": "another_name", "type": "translation", "priority": 2}
    ]
  }
}
```

Supported alias types:
- `abbreviation` - Short forms (e.g., "TSH", "B12")
- `translation` - English translations (e.g., "glucose", "thyroid")
- `common_name` - Colloquial terms (e.g., "cukier", "tarczyca")
- `scientific_name` - Scientific/medical terms (e.g., "ferritin", "cortisol")

Then import with:
```bash
uv run scripts/import_aliases.py your_aliases.json
```
