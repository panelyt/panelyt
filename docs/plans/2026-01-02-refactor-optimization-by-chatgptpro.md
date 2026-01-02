# Batched task plan

## Batch 1 — Stop the bleeding (correctness + ops)

**Goal:** fix real bugs and obvious deployment/CI foot-guns first.

### 1. Fix Telegram HTML escaping (API)

**Files:** `apps/api/src/panelyt_api/services/alerts.py`

* Escape **every** dynamic string inserted into HTML:

  * `saved_list.name`
  * `lab.code`, `lab.name` (safe-ish but still)
  * `item.name`
  * URLs in `<a href="...">` attributes (`html.escape(url, quote=True)`)
* Add a tiny helper like `def tg_html(text: str) -> str: return html.escape(text, quote=False)` and a separate helper for attributes.
* Add tests:

  * List name containing `<b>`, `&`, `"` should not break message.
  * Item name containing `<a href=...>` should be escaped, not interpreted.

**Acceptance criteria**

* Alert messages render correctly even with “hostile” names/URLs.
* Unit test proving escaping exists.

---

### 2. Fix web Dockerfile dead step

**Files:** `apps/web/Dockerfile`

* Remove the final `RUN corepack prepare pnpm@...` in the `runner` stage.
* Optional: ensure runtime stage contains only `.next/standalone`, static assets, and `node` user.

**Acceptance criteria**

* Smaller image layers; build logs confirm removed step.

---

## Batch 2 — Ingestion + matching: remove wasted work

**Goal:** cut ingestion runtime and DB load substantially.

### 1. Run matching once per ingestion, not once per lab

**Files:** `apps/api/src/panelyt_api/ingest/service.py`

Current flow:

* stage lab A → apply matching → synchronize
* stage lab B → apply matching → synchronize

Fix:

* stage **all** labs, keep contexts in a list
* apply matching **once**
* synchronize catalog for each staged context

**Acceptance criteria**

* Matching is executed once per ingestion run.
* Ingestion runtime drops materially (should be obvious even locally).

---

### 2. Skip matching if config hasn’t changed

**Files:** `apps/api/src/panelyt_api/matching/config.py`, `apps/api/src/panelyt_api/matching/loader.py`, plus a tiny DB persistence location.

Strong opinion: matching config is not “runtime logic”, it’s essentially **data migration**. Running it every ingestion is waste.

Implementation options (choose one):

* Store `sha256(biomarkers.yaml)` hash in `app_activity` (it’s a key/value-ish table already), e.g. `name="matching_config_hash"`.
* Only run `apply()` if the stored hash differs.

**Acceptance criteria**

* No-op ingestion runs don’t redo 4k biomarker sync operations.

---

### 3. Bulkify MatchingSynchronizer (stop doing thousands of tiny queries)

**Files:** `apps/api/src/panelyt_api/matching/loader.py`

Right now it does per-biomarker:

* select biomarker
* maybe insert/update
* select aliases
* insert missing aliases
* resolve lab biomarker IDs (per match)
* insert/update match row

Refactor strategy:

* Preload everything needed into in-memory dicts in a few queries:

  * existing `Biomarker` by slug
  * existing `BiomarkerAlias` by (biomarker_id, lower(alias))
  * lab IDs by code
  * lab biomarker IDs by (lab_id, external_id) and by (lab_id, slug)
  * existing `BiomarkerMatch` by lab_biomarker_id
* Compute diffs in Python.
* Perform **bulk** inserts/updates.

This is a big win and *also* reduces code noise (fewer small helper queries).

**Acceptance criteria**

* Matching apply time scales roughly linearly but with low constant factors (no “death by 10k queries”).

---

## Batch 3 — API refactor for maintainability + less code

**Goal:** simplify hot paths and eliminate duplication.

### 1. Add relationship ordering at the ORM level

**Files:** `apps/api/src/panelyt_api/db/models.py` + remove sort code in services

Add `order_by=` to:

* `SavedList.entries`
* `BiomarkerListTemplate.entries`

Then delete repeated:

* `entries.sort(key=...)` and any “ensure sorted” boilerplate in:

  * `services/saved_lists.py`
  * `services/list_templates.py`
  * any schema-building code that sorts again

**Acceptance criteria**

* Entries always come ordered from DB load.
* Fewer lines and fewer “just in case” sorts.

---

### 2. Kill import-time settings branching in DB model/type selection

**Files:** `apps/api/src/panelyt_api/db/base.py`, `apps/api/src/panelyt_api/db/models.py`

Current pattern calls `get_settings()` at import time to choose:

* schema vs no schema
* JSONB vs JSON

Better:

* Use SQLAlchemy variants:

  * `JSON().with_variant(JSONB, "postgresql")`
* Schema handling should not require import-time settings calls; prefer:

  * configure schema in Alembic/env and/or engine options
  * or keep schema fixed and set search_path in Postgres (cleaner)

**Acceptance criteria**

* DB models don’t depend on env at import time.
* Less brittle startup/testing.

---

### 3. Consolidate repeated “resolve biomarker codes → DB biomarker rows”

**Files:** `services/saved_lists.py`, `services/list_templates.py`, `optimization/service.py`

There’s repeated logic for:

* normalize token
* resolve by elab_code/slug/alias
* map to display name

Extract one shared resolver service:

* `BiomarkerResolver(session)` with methods:

  * `resolve_tokens(tokens: list[str]) -> (resolved, unresolved)`
  * `resolve_for_list_entries(...)`

This reduces LOC and improves consistency.

**Acceptance criteria**

* One resolver implementation; fewer subtle differences.

---

## Batch 4 — LOC minimization: remove guards that truly can’t happen

**Goal:** cut dead checks, but only after enforcing invariants where they belong.

### 1. Remove redundant enum coercion / parsing

**Files:** `apps/api/src/panelyt_api/optimization/service.py`

* Replace:

  * `try: mode = OptimizeMode(payload.mode) except: mode = OptimizeMode.AUTO`
* With:

  * `mode = payload.mode`

Reason: Pydantic already validated it. Keeping try/except is just noise.

**Acceptance criteria**

* No behavior change; fewer lines.

---

### 2. Remove checks that are provably redundant by construction

Concrete examples worth deleting:

* `apps/api/src/panelyt_api/services/saved_lists.py`

  * `create_list()` contains `if saved_list.share_token: ...` immediately after creating a list without a share token. Dead.
* `apps/api/src/panelyt_api/services/telegram.py`

  * `_detach_existing()` checks `if not chat_id: return` after normalization + caller validation.
* Any `isinstance(x, str)` checks in internal-only code paths where types already guarantee `str`.

**Rule (non-negotiable):**

* Do **not** remove guards around:

  * external API ingestion payloads
  * network I/O
  * DB uniqueness races
  * security boundaries (auth, secrets, cookies)

Those “can never happen” assumptions are fantasy in production.

**Acceptance criteria**

* Fewer branches and cleaner code, without reducing robustness on external inputs.

---

### 3. Strip excessive docstrings/comments in code paths (move to docs)

**Files:** `apps/api/src/panelyt_api/utils/normalization.py` (and similar)

If LOC is a priority, this module is massively over-documented for what it does.

* Keep *minimal* docstrings where it matters.
* Move long examples to `docs/` or tests (you already have tests).

**Acceptance criteria**

* Same behavior + tests still document usage.

---

## Batch 5 — Frontend: delete complexity by changing APIs (biggest LOC win)

**Goal:** stop making the browser orchestrate your backend.

### 1. Replace “per-list optimize calls” with server-provided totals

**Files:**

* Web: `apps/web/src/app/[locale]/lists/lists-content.tsx`
* API: `apps/api/src/panelyt_api/api/saved_lists.py`, `services/saved_lists.py`

Options (ranked):

1. **Best:** compute and store list totals on list create/update (AUTO mode) and return them in `/lists`.
2. Provide a bulk endpoint:

   * `POST /lists/totals` with `{ lists: [{id, biomarkers:[...]}] }`
   * returns `{ id: total_now, currency }` in one call
3. Least ideal: keep client-side N calls.

This will delete a lot of client code, remove spinners/error state machinery, and reduce load.

**Acceptance criteria**

* Lists page loads with ≤1 totals request (ideally 0).
* `lists-content.tsx` shrinks drastically.

---

### 2. Stop the client from running 3+ optimization strategies itself

**Files:**

* Web: `apps/web/src/hooks/useLabOptimization.tsx`
* API: `apps/api/src/panelyt_api/api/optimize.py`, `optimization/service.py`

Right now the web does:

* AUTO
* SPLIT
* N “single_lab” comparisons

That’s why `useLabOptimization.tsx` is huge.

Fix by introducing an API that returns a compact “comparison bundle”:

* `POST /optimize/compare`:

  * input: biomarkers
  * output: `{ auto, split, by_lab: { diag: ..., alab: ... }, lab_options }`

Then frontend:

* renders what it’s given
* stops re-deriving coverage/savings/badges in 400 lines of hook logic

**Acceptance criteria**

* Replace `useQueries` fan-out with one query.
* `useLabOptimization.tsx` becomes mostly “map response → UI”.

---

### 3. Remove unused frontend deps and dead hooks

**Files:** `apps/web/package.json`, `apps/web/src/hooks/useBiomarkerSearch.ts`

* `axios` appears unused → remove.
* `useBiomarkerSearch` appears unused → remove.
* Re-run lint/test.

**Acceptance criteria**

* Smaller dependency surface and fewer files to maintain.

---

## Batch 6 — “Other improvements” that actually matter

**Goal:** production readiness without bloating the code.

### 1. Add session pruning / cleanup job

**Files:** API service layer + scheduler

You create anonymous users/sessions. Without cleanup, the DB grows forever.

Implement:

* periodic job (daily) to delete:

  * expired sessions
  * users with no username/password/email and no lists and no telegram link older than N days

**Acceptance criteria**

* DB growth is bounded.

---

### 2. Add DB indexes aligned with real queries

**Files:** new Alembic migration(s)

High-ROI indexes:

* `item_biomarker (biomarker_id, item_id)` (or at least `biomarker_id`)
* `item (lab_id, is_available)` and/or partial index on `is_available=true`
* `price_snapshot (snap_date, item_id)` (you filter by date and group by item)
* `saved_list (user_id)` and `saved_list (share_token)` (share_token is unique already, so indexed)

For search:

* If you want real speed, stop doing `lower(name) LIKE '%q%'` without support.

  * Either add normalized columns + btree indexes, or use trigram indexes in Postgres.

**Acceptance criteria**

* Explain plans show index usage on hot queries.

---

### 3. Observability without bloat

* Add structured logging around ingestion duration, matching duration, optimization solve duration.
* Add request IDs and basic metrics counters.
* Keep it minimal: don’t introduce three observability stacks.

