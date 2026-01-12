# Multi-office (institution) selection — spec

## Context
Panelyt currently ingests Diagnostyka e‑shop catalog data for a **single** institution (office) — `institution=1135` (lab office). Diagnostyka’s APIs support many offices, and **prices + availability** can differ per office.

We want to let users choose an office and have **all prices / optimization results / curated templates pricing** reflect that selection. We also need **snapshots** to support price history and notifications while avoiding ingesting **hundreds** of offices unnecessarily.

### Relevant external APIs (Diagnostyka)
- Product prices per institution (example):
  - `GET https://api-eshop.diag.pl/api/front/v1/products/<slug>/prices?filter[institution]=<id>`
- Office search (example):
  - `GET https://api-eshop.diag.pl/api/v1/institution-service/institutions/search?...&q=<query>`

> Note: existing ingestion uses the *catalog listing* endpoints with `filter[institution]=1135` (packages + singles). We will generalize that to any institution.

---

## Goals
1. **User-selectable office**
   - Users can search and select an office (institution).
   - The selected office applies **globally** across the app (optimizer, catalog search, templates pricing).
2. **Per-office pricing + availability**
   - Store prices and availability per institution.
   - Support offices having different subsets of available items/biomarkers.
3. **Snapshots for history + notifications**
   - Record daily snapshots per institution to support:
     - 30‑day min price computations (optimization “min30”).
     - future price notifications / change detection.
4. **Scale to hundreds of offices**
   - Do **not** ingest all offices by default.
   - Ingest **on demand** and **scheduled only for active offices**.
5. **Persistence**
   - Store preferred office in **user account settings** (works for registered and anonymous accounts).
   - On the web client, also persist locally for fast UX and to avoid re-querying.

---

## Non-goals
- Supporting multiple labs/vendors (only Diagnostyka).
- Perfectly modeling institution-specific package composition differences.
  - Assumption: for a given Diagnostyka product `external_id`, biomarker coverage is stable; only *offer availability and price* vary by institution.
  - If the upstream API ever violates this, we will log + monitor, and consider a follow-up design for per-institution coverage.
- Implementing a full “price drop subscription per biomarker” system (we keep existing list-total notifications behavior; snapshots are groundwork).

---

## Terminology
- **Institution / office**: Diagnostyka location that can sell a subset of items, with institution-specific pricing.
- **Item**: A Diagnostyka product in the e‑shop (single test or package).
- **Offer**: The institution-specific view of an item: price(s) + availability.

---

## UX requirements
### Office selection
- Provide an office search + selection UI.
- The selected office affects:
  - `/` optimizer prices and uncovered biomarkers.
  - `/collections` template cards pricing (total).
  - `/catalog/search` and `/catalog/biomarkers` prices.
  - any “Apply template” operations that depend on `/optimize`.

### Persistence rules
- Default office (fallback) is `1135`.
- If the user is logged in (or has a session), store `preferred_institution_id` in `user_account`.
- When a user selects an office for the first time, we upsert the office into DB.
- When preferred office changes:
  - invalidate client caches (optimization results, template pricing).
  - reset/clear any cached list totals used for notifications to avoid mixing offices.

---

## Backend design

### Data model
We separate **global product definitions** from **institution-specific offers**.

#### Tables
1. `institution`
   - `id` (int, PK) — Diagnostyka institution id
   - `name` (text)
   - `city` (text, nullable)
   - `address` (text, nullable)
   - `postal_code` (text, nullable)
   - `is_temporary_disabled` (bool, default false)
   - `attributes` (jsonb, nullable) — ESHOP/ECO/PPA flags etc
   - `created_at`, `updated_at`

2. `institution_item` (offers)
   - `institution_id` (FK → institution.id)
   - `item_id` (FK → item.id)
   - `is_available` (bool)
   - `currency` (text)
   - `price_now_grosz` (int)
   - `price_min30_grosz` (int, nullable)
   - `sale_price_grosz` (int, nullable)
   - `regular_price_grosz` (int, nullable)
   - `fetched_at` (timestamptz)
   - unique constraint `(institution_id, item_id)`

3. `price_snapshot` (extended)
   - add `institution_id` (FK → institution.id)
   - new primary key: `(institution_id, item_id, snap_date)`
   - columns:
     - `snap_date` (date)
     - `price_now_grosz` (int)
     - `price_min30_grosz` (int)
     - `sale_price_grosz` (int, nullable)
     - `regular_price_grosz` (int, nullable)
     - `is_available` (bool)

4. `user_account`
   - add `preferred_institution_id` (FK → institution.id, nullable)

> Existing tables `item`, `biomarker`, `item_biomarker` remain global.

#### Indexing
- `institution_item`
  - index on `(institution_id, is_available)` (partial where available)
  - index on `(institution_id, price_now_grosz)` (partial where available and >0)
- `price_snapshot`
  - index on `(institution_id, snap_date)`
  - index on `(institution_id, item_id, snap_date)` (implicit via PK)

### Migration strategy
- Backfill existing data as belonging to default institution `1135`:
  - create `institution` row for `1135` (name can be “Default / Lab office” if we don’t fetch details during migration).
  - populate `institution_item` from `item` (current price fields).
  - migrate existing `price_snapshot` rows with `institution_id=1135`.
- Keep `item.price_*` columns initially (legacy) but stop reading them in code.
  - Optional future migration: drop price columns from `item` after rollout.

---

## Ingestion & storage

### Core principle
- **Ingest product definitions globally** (`item`, `biomarker`, `item_biomarker`).
- **Ingest offers per institution** (`institution_item` + `price_snapshot`).

### Active institution set
To avoid ingesting hundreds of offices, scheduled ingestion runs only for **active institutions**.

Definition (v1): an institution is “active” if it is referenced by at least one user who has:
- at least one saved list, OR
- at least one list with price-drop notifications enabled.

Implementation: `SELECT DISTINCT user_account.preferred_institution_id` joined via `saved_list.user_id`.
- Null preferred institution → treat as default (`1135`).

### On-demand ingestion
When an API request arrives for `institution_id=X` and we have no recent data for X:
- run ingestion for X synchronously (unless `background=true`).
- on first ever use of X, create `institution` record (from Diagnostyka institution search/details).

### Per-institution “freshness”
- Replace global freshness check with per-institution check:
  - `latest_fetched_at(institution_id)` reads from `institution_item.fetched_at`.
  - `staleness_threshold_hours` continues to apply.

### Upsert & pruning rules
Per institution ingestion run:
1. Fetch packages + singles for that institution.
2. Upsert global items + biomarkers (as today).
3. Upsert **institution_item** offers for *all fetched items*.
4. Mark offers missing from today’s fetch as `is_available=false` for that institution (or delete rows).
   - Do **not** delete global `item` rows based on a single institution’s catalog.
5. Write/update today’s `price_snapshot` rows for that institution.
6. Prune `price_snapshot` older than retention window (e.g. 35 days), optionally scoped by institution.

### Snapshot retention
- Keep 35 days of snapshots per institution (same as current behavior).

---

## Optimization & catalog queries

### All reads become institution-aware
Anywhere we previously read `item.price_now_grosz` / `item.is_available` must now read from `institution_item` filtered by the selected institution.

Key changes:
- Optimization candidate query joins `institution_item` and filters `institution_id`.
- 30‑day history for min price uses `price_snapshot` filtered by `institution_id`.
- Catalog biomarker search price map uses `institution_item` filtered by `institution_id`.

### Caching
- Optimization result cache keys must include `institution_id`.
  - `cache_key = hash(institution_id + sorted_biomarkers)`
- Optimization context cache keys must include `institution_id`.
- Freshness cache becomes keyed by `institution_id`.

---

## Account settings & notifications

### Preferred office storage
- Add `preferred_institution_id` to `user_account`.
- Expose via `/account/settings`.
- Add an endpoint to update preferred office (e.g. `PATCH /account/settings`).

### Notifications (Telegram price-drop on lists)
- When evaluating a saved list for price-drop:
  - use the *user’s current* `preferred_institution_id` (fallback default 1135).
- When creating/updating a saved list (and computing `last_known_total_grosz`):
  - use the same institution selection rules (user preferred, fallback 1135).
- When user changes preferred office:
  - clear saved list cached totals (`last_known_total_grosz`, `last_total_updated_at`, `last_notified_total_grosz`, `last_notified_at`) to avoid mixing baselines between offices.

---

## API surface

### Institution endpoints (new)
- `GET /institutions/search?q=<text>&page=<n>&limit=<n>`
  - Proxies Diagnostyka office search, returns a simplified list.
- `GET /institutions/{id}`
  - Returns cached institution data from DB (and can refresh from upstream if missing).

### Institution selection in existing endpoints
All price-sensitive endpoints accept an optional `institution` query parameter.
- `POST /optimize?institution=1234`
- `POST /optimize/addons?institution=1234`
- `GET /catalog/biomarkers?query=...&institution=1234`
- `GET /catalog/search?query=...&institution=1234`

Behavior:
- If `institution` is omitted, use:
  1) user’s preferred institution if available (when applicable), otherwise
  2) default 1135.

---

## Observability
Add metrics/logs to make multi-institution ingestion debuggable:
- `ingestion.institution.run` with labels: `institution_id`, `reason`, `scheduled`.
- counts: fetched items, offers upserted, snapshots written.
- warn logs for:
  - missing institution metadata
  - unexpected data (e.g. same external_id with conflicting biomarker sets)

---

## Acceptance criteria
- Users can select an office, and optimizer/templates/catalog prices reflect it.
- DB stores prices/availability per institution without duplicating global item definitions.
- Scheduled ingestion runs only for active institutions.
- On-demand ingestion works when a user selects a new institution.
- Optimization and catalog endpoints are institution-aware and caches are safe.
- Telegram list price-drop alerts use the user’s preferred institution.
