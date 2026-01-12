# Panelyt Web

Next.js App Router client with bilingual support (English/Polish). Provides biomarker search, panel assembly, and price optimization visualization.

## Setup

From the repository root:

```bash
just install web
```

## Development

```bash
just dev web        # Start dev server on :3000
just test web       # Run tests
just lint web       # Lint and typecheck
```

The app expects the API on `http://localhost:8000`. Set `NEXT_PUBLIC_API_URL` to override.

## Structure

```
src/
  app/        # App Router pages and layouts
  components/ # UI components
  hooks/      # React Query hooks
  lib/        # API client, utilities
  messages/   # i18n translations (en.json, pl.json)
```

Shared schemas live in `packages/types` (`@panelyt/types`).
