# Panelyt — Spec

Panelyt minimizes the total cost of selected blood tests by picking the cheapest mix of **single tests**, **packages**, or **both** from `diag.pl`.
With **30-day price history** (max one datapoint per item per day).

---

## Goals

* Fast to ship for 2–10 users.
* Persist normalized catalog in shared Postgres.
* Keep **daily snapshots** for 30 days (≤24h between datapoints).
* Compute and display: **Current total** and **Panelyt 30-day minimum total**.

---

## Architecture

* **Frontend:** Next.js (App Router, TS), TanStack Query, Zod, Tailwind.
* **Backend:** FastAPI (Python) + SQLAlchemy + Alembic + OR-Tools (CP-SAT) + APScheduler (in-process) for daily fetch.
* **DB:** Existing `shared-db` (Postgres 16) via bridge network `shared-db`.

---

## Repo Layout

```
panelyt/
  apps/
    web/                 # Next.js client
    api/                 # FastAPI (ingest + optimize + scheduler)
  infra/
    docker-compose.yml   # api + web (DB is external)
  README.md
```

---

## Data Sources (diag.pl)

* Packages: `https://api-eshop.diag.pl/api/front/v1/products?filter[type]=package,shop-package&filter[institution]=1135&limit=200&page=1&include=prices`
* Single tests: `https://api-eshop.diag.pl/api/front/v1/products?filter[type]=bloodtest&filter[institution]=1135&limit=200&page=1&include=prices`
* Combined: `https://api-eshop.diag.pl/api/front/v1/products?filter[type]=package,shop-package,bloodtest&filter[institution]=1135&limit=200&page=1&include=prices`

Rules:

* Paginate `page=1..meta.last_page`.
* Keep only `prices.sellState === "available"`.
* **Current price:** `prices.sale.gross ?? prices.regular.gross` (PLN).
* **Upstream 30-day minimum (per item):** `prices.minimal.gross` (PLN).
* Links:

  * Package: `https://diag.pl/sklep/pakiety/{slug}`
  * Test: `https://diag.pl/sklep/badania/{slug}`

---

## Database (schema: `panelyt`)

All prices in **grosz** (PLN×100). History is **one row per item per calendar day**.

```sql
CREATE SCHEMA IF NOT EXISTS panelyt;

CREATE TABLE IF NOT EXISTS panelyt.biomarker (
  id         SERIAL PRIMARY KEY,
  elab_code  TEXT UNIQUE,     -- preferred key
  slug       TEXT UNIQUE,     -- fallback
  name       TEXT
);

CREATE TABLE IF NOT EXISTS panelyt.item (
  id                 BIGINT PRIMARY KEY,                         -- diag.pl id
  kind               TEXT NOT NULL CHECK (kind IN ('package','single')),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL,
  is_available       BOOLEAN NOT NULL DEFAULT TRUE,
  currency           TEXT NOT NULL DEFAULT 'PLN',
  price_now_grosz    INTEGER NOT NULL,                           -- current price
  price_min30_grosz  INTEGER NOT NULL,                           -- upstream 30d min
  fetched_at         TIMESTAMPTZ NOT NULL                        -- last seen
);

CREATE TABLE IF NOT EXISTS panelyt.item_biomarker (
  item_id       BIGINT REFERENCES panelyt.item(id) ON DELETE CASCADE,
  biomarker_id  INT    REFERENCES panelyt.biomarker(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, biomarker_id)
);

-- Daily price snapshots (Panelyt’s own history)
CREATE TABLE IF NOT EXISTS panelyt.price_snapshot (
  item_id            BIGINT REFERENCES panelyt.item(id) ON DELETE CASCADE,
  snap_date          DATE NOT NULL,                              -- UTC date (yyyy-mm-dd)
  price_now_grosz    INTEGER NOT NULL,
  is_available       BOOLEAN NOT NULL,
  seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, snap_date)
);

-- Optional: raw payload for diagnostics (rotated)
CREATE TABLE IF NOT EXISTS panelyt.raw_snapshot (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT NOT NULL,          -- 'packages'|'bloodtest'|'combined'
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload     JSONB NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS panelyt_idx_item_kind_avail   ON panelyt.item(kind, is_available);
CREATE INDEX IF NOT EXISTS panelyt_idx_item_price_now     ON panelyt.item(price_now_grosz);
CREATE INDEX IF NOT EXISTS panelyt_idx_ib_biomarker       ON panelyt.item_biomarker(biomarker_id);
CREATE INDEX IF NOT EXISTS panelyt_idx_snap_date_item     ON panelyt.price_snapshot(snap_date, item_id);
```

**Least-privilege role (recommended):**

```sql
CREATE ROLE panelyt_app LOGIN PASSWORD 'REPLACE_ME';
GRANT USAGE ON SCHEMA panelyt TO panelyt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA panelyt TO panelyt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA panelyt TO panelyt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA panelyt
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO panelyt_app;
```

---

## Networking / Config

* API container joins `shared-db` network; connect via host `shared-db`.

**apps/api `.env`:**

```
DATABASE_URL=postgresql+psycopg2://panelyt_app:REPLACE_ME@shared-db:5432/postgres
DB_SCHEMA=panelyt
CORS_ORIGINS=http://localhost:3000
TIMEZONE=Europe/Oslo
```

**infra/docker-compose.yml (api+web only):**

```yaml
version: "3.9"
services:
  api:
    build: ../apps/api
    env_file:
      - ../apps/api/.env
    ports: ["8000:8000"]
    networks: [shared-db]
    restart: unless-stopped

  web:
    build: ../apps/web
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    ports: ["3000:3000"]
    depends_on: [api]
    restart: unless-stopped

networks:
  shared-db:
    external: true
```

---

## Ingestion & History Policy

### Staleness & daily rule

* **Serve-fresh rule:** If the latest `item.fetched_at` is **≥ 3h** old, trigger ingestion (single-flight lock).
* **Daily snapshot rule:** Ensure **one snapshot per day** for each item (≤24h between data points) for the **last 30 days**.

  * Run a scheduler at **03:15 local time (Europe/Oslo)** daily.
  * If a **user opened the app within the last 24h** and ingestion already ran (and wrote today’s snapshots), the scheduled job **no-ops**.
  * De-dupe by `ON CONFLICT (item_id, snap_date) DO NOTHING`.

### Steps on ingestion run

1. Fetch all pages (packages + bloodtests).
2. Filter `sellState === "available"`.
3. Compute:

   * `price_now_grosz` = int( (sale or regular) ×100 )
   * `price_min30_grosz` = int( upstream minimal ×100 )
4. Upsert `biomarker` (by `elab_code`, fallback `slug`).
5. Upsert `item` (set `fetched_at = now()`).
6. Replace `item_biomarker` rows for that item.
7. **Write daily snapshot** to `price_snapshot` with `snap_date = (now at TIMEZONE)::date`.
8. **Retention:** delete snapshots older than **35 days**:

   ```sql
   DELETE FROM panelyt.price_snapshot WHERE snap_date < (CURRENT_DATE - INTERVAL '35 days');
   ```
9. (Optional) store one raw payload into `raw_snapshot` for debugging (rotate with retention 7 days).

---

## Optimization

**Goal:** cover user-selected biomarkers **B** at minimum cost.

* Variables: `x_i ∈ {0,1}` for each candidate item `i`.
* Coverage: ∀`b ∈ B`, `Σ_{i: b∈covers(i)} x_i ≥ 1`.
* **Objective A (Current):** minimize `Σ price_now_grosz(i) * x_i`.
  → built from `item.price_now_grosz`.
* **Objective B (Panelyt 30-day minimum):** minimize `Σ hist_min_30d(i) * x_i`, where:

  ```sql
  SELECT item_id, MIN(price_now_grosz) AS hist_min_30d
  FROM panelyt.price_snapshot
  WHERE snap_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY item_id;
  ```

  If a given item has no history (new), fall back to `item.price_min30_grosz` (upstream) or `item.price_now_grosz` as last resort.

**Pre-solve pruning (in memory):**

* **Cheapest single per biomarker** (drop higher-priced duplicates).
* **Dominance:** drop item **B** if ∃**A** with `covers(A) ⊇ covers(B)` and `price_now(A) ≤ price_now(B)`.

**Outputs:**

```json
{
  "total_now": 298.00,
  "total_min30": 287.00,      // computed from Panelyt history (not upstream field)
  "items": [...],
  "explain": { "ALT": ["pkg:..."], "...": ["..."] },
  "uncovered": []
}
```

---

## API (FastAPI)

* `GET /healthz`
* `GET /catalog/meta`

  * counts (items, biomarkers),
  * `latest_fetched_at`,
  * history coverage (snapshot days present over last 30),
  * % items with today’s snapshot.
* `GET /biomarkers?query=ALT`
* `POST /optimize`

  ```json
  { "biomarkers": ["ALT","AST","CRP"] }
  ```

  Returns totals (current & Panelyt 30-day min), chosen items, explain, uncovered.
* **(Optional) `GET /history/items/:id?days=30`**

  * Returns the last N daily points for sparkline/QA.

---

## Scheduler (APScheduler)

* Start a background scheduler within the API container.
* Job: `ingest_and_snapshot()` at `03:15 Europe/Oslo` daily, with ±10m jitter.
* Deduplicate with a DB advisory lock or a simple `ingest_lock` row to avoid concurrent runs if you scale to >1 API instance later.

---

## Frontend

  * Typeahead (name or `elabCode`), Enter adds top result.
  * Chips for selected biomarkers.
  * Results:

    * **Current total** (from `item.price_now_grosz`).
    * **30-day minimum total** labeled “Panelyt 30-day minimum” (from snapshots).
    * Group items: Packages / Single tests.
    * Coverage matrix; “on sale” badge when sale < regular.
    * External links per item.
* (Optional) per-item 30-day sparkline shown on hover (using `/history/items/:id`).

---

## Testing

* **Golden snapshot** to validate normalization.
* Unit tests: ingestion mapping, price computation, upserts, snapshot dedupe, retention.
* Property tests: removing any chosen item breaks coverage or raises objective.
* Integration test: run optimizer with (a) current prices, (b) history mins; verify totals differ as expected.

---

## Deployment

* API + Web on same host; API attached to `shared-db` network.
* Health probe hits `/healthz`.
* Rely on scheduler for daily data if no user activity; otherwise user activity’s staleness checks will refresh as needed.
* No PHI stored.
