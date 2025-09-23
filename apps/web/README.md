# Panelyt Web

Next.js App Router client for Panelyt. Provides biomarker search, selection chips, and an
optimization dashboard that consumes the FastAPI backend.

## Local development

1. Install dependencies (from repository root):
   ```bash
   make install-web
   ```
2. Copy `.env.local.example` to `.env.local` if you need to override `NEXT_PUBLIC_API_URL` or
   provide an `INTERNAL_API_URL` for containerized runs.
3. Start the dev server:
   ```bash
   make dev-web
   ```

The app expects the API on `http://localhost:8000`. Update `NEXT_PUBLIC_API_URL` if you run the API
elsewhere for the browser, and optionally `INTERNAL_API_URL` for server-side access inside Docker.

## Key scripts

- `pnpm dev` – Next.js dev server (Turbo).
- `pnpm build` – production build (`.next/standalone`).
- `pnpm lint` – ESLint.
- `pnpm typecheck` – TypeScript project validation.

## Structure

- `src/app` – App Router pages and layout.
- `src/components` – UI components (search box, selected chips, optimization results).
- `src/hooks` – React Query hooks and helpers.
- `src/lib` – HTTP helper + currency formatting.

Shared schemas live in `packages/types` and are imported via `@panelyt/types`.
