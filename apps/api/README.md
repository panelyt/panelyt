# Panelyt API

FastAPI service that ingests the diag.pl catalog, stores a 30-day price history, and exposes optimization endpoints.

## Setup

From the repository root:

```bash
just install api
```

## Development

```bash
just dev api       # Start dev server on :8000
just test api      # Run tests
just lint api      # Lint and typecheck
just fmt api       # Format code
just migrate       # Run database migrations
```

## Production Deployment

### Prerequisites
- Docker and Docker Compose installed

### Configure environment

1. **Prepare compose settings:**
   ```bash
   cd infra
   cp .env.example .env
   # edit .env and change passwords, allowed origins, ports, etc.
   ```

2. **Deploy with Docker:**
   ```bash
   docker compose up -d --build
   ```

3. **Import biomarker aliases (optional):**
   ```bash
   docker compose exec api uv run scripts/import_aliases.py data/core_aliases.json
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

Then import with (after activating `.venv`):
```bash
uv run scripts/import_aliases.py your_aliases.json
```
