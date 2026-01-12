# Multi-office (institution) selection — implementation plan

This is a step-by-step, agent-friendly task list to implement **office selection** end-to-end:
- DB schema for institution-specific offers and snapshots
- per-institution ingestion (scheduled + on-demand)
- institution-aware optimization + catalog search
- preferred office stored in account settings
- UI for selecting an office + wiring it through all queries

Each task is intentionally scoped small with clear acceptance criteria.

---

## Backend (apps/api)

### Task 01 — Add DB schema for institutions + per-institution offers
**Prompt:**
Create an Alembic migration that introduces institution-aware storage.

**Changes:**
1. New table `institution` (Diagnostyka offices)
2. New table `institution_item` (offer: price + availability per institution and item)
3. Extend `price_snapshot` with `institution_id` and migrate PK to `(institution_id, item_id, snap_date)`
4. Add `preferred_institution_id` to `user_account`
5. Seed default institution `1135`
6. Backfill existing `item.price_*` → `institution_item` for institution `1135`
7. Backfill existing `price_snapshot` rows with `institution_id=1135`

**Files:**
- `apps/api/alembic/versions/2026xxxxxxx_add_institutions_and_offers.py` (new)

**Acceptance criteria:**
- `alembic upgrade head` succeeds on a fresh DB.
- Existing tests/migrations that rely on old `price_snapshot` schema are updated.
- After migration, there is a row `institution.id=1135`.
- After migration, `institution_item` has rows for `institution_id=1135` matching the old `item` price fields.

---

### Task 02 — Update SQLAlchemy models for new tables/columns
**Prompt:**
Add ORM models / relationships for `Institution`, `InstitutionItem`, and update `PriceSnapshot` + `UserAccount`.

**Files:**
- `apps/api/src/panelyt_api/db/models.py`

**Acceptance criteria:**
- `pytest apps/api/tests/test_models.py` passes.
- New models have correct constraints + indexes (where supported by SQLAlchemy models).
- `UserAccount.preferred_institution_id` is nullable and has FK to `institution.id`.

---

### Task 03 — Generalize Diagnostyka client for per-institution catalog fetch
**Prompt:**
Refactor the ingestion client so it can fetch catalog data for an arbitrary institution.

**Changes:**
- Update `DiagClient.fetch_all()` to accept `institution_id: int`.
- Add `DiagClient.search_institutions(q, page, limit)` using the Diagnostyka institution search endpoint.

**Files:**
- `apps/api/src/panelyt_api/ingest/client.py`

**Acceptance criteria:**
- `await DiagClient().fetch_all(1135)` still returns the same shape as before.
- `await DiagClient().fetch_all(<other_id>)` produces valid parsed items.
- Institution search returns a normalized internal representation (id, name, city, address).

---

### Task 04 — Add InstitutionService (upsert + lookup + active institutions query)
**Prompt:**
Create a small service layer for institutions:
- Upsert an institution record from upstream payload.
- Ensure an institution exists in DB (used when user selects an office).
- Compute the active institution ids set for scheduled ingestion.

**Files:**
- `apps/api/src/panelyt_api/services/institutions.py` (new)
- (optional) `apps/api/src/panelyt_api/schemas/institutions.py` (new)

**Acceptance criteria:**
- `await service.ensure_institution(1234)` creates or returns the DB row.
- Active institution query returns `{1135}` at minimum.
- Active institution query includes distinct `preferred_institution_id` for users that have saved lists.

---

### Task 05 — Refactor CatalogRepository upserts to write institution_item + institution snapshots
**Prompt:**
Update ingestion persistence so prices/availability are stored per institution.

**Changes:**
- `CatalogRepository.upsert_catalog(...)` becomes `upsert_catalog(institution_id, fetched_at, singles, packages)`.
- Upsert global `Item` and `Biomarker` as before.
- Write prices/availability into `InstitutionItem`.
- Write daily `PriceSnapshot` rows with `(institution_id, item_id, snap_date)`.
- Replace global `prune_missing_items(external_ids)` with per-institution offer pruning:
  - mark missing offers unavailable OR delete missing `InstitutionItem` rows for that institution.
- Keep `prune_orphan_biomarkers()` as global.

**Files:**
- `apps/api/src/panelyt_api/ingest/repository.py`

**Acceptance criteria:**
- Repository tests are updated and pass (`apps/api/tests/test_ingestion_repository.py`).
- Ingesting institution A does not delete items that only exist in institution B.
- Running ingestion twice is idempotent.

---

### Task 06 — Make ingestion service per-institution (freshness + scheduled active offices)
**Prompt:**
Update `IngestionService` to:
- Check freshness per institution.
- Ingest **only active institutions** on scheduled runs.
- Ingest a single institution on-demand for API requests.

**Changes:**
- `ensure_fresh_data(institution_id, background=False)`
- `run(scheduled=True)` computes active institutions via `InstitutionService` and ingests them sequentially.
- Freshness cache becomes keyed by institution.

**Files:**
- `apps/api/src/panelyt_api/ingest/service.py`
- `apps/api/src/panelyt_api/core/cache.py` (freshness cache changes)
- `apps/api/src/panelyt_api/ingest/scheduler.py`

**Acceptance criteria:**
- Scheduled ingestion ingests only the active institution set.
- On-demand ingestion for institution X updates `institution_item.fetched_at`.
- Freshness caching does not block other institutions from refreshing.

---

### Task 07 — Make optimization institution-aware (offers + snapshots)
**Prompt:**
Refactor optimization candidate selection and history queries to use institution-specific data.

**Changes:**
- Optimization accepts `institution_id` (query param or request field).
- Candidate query joins `InstitutionItem` filtered by `institution_id`.
- Price history uses `PriceSnapshot` filtered by `institution_id`.
- Cache keys include `institution_id`.

**Files:**
- `apps/api/src/panelyt_api/optimization/service.py`
- `apps/api/src/panelyt_api/core/cache.py`
- `apps/api/src/panelyt_api/api/optimize.py` (plumb institution into service)

**Acceptance criteria:**
- `pytest apps/api/tests/test_optimization_service.py` passes (updated).
- Cache does not cross-contaminate results between institutions.
- Candidate item availability differs between institutions when upstream differs.

---

### Task 08 — Make catalog search institution-aware (biomarker price map)
**Prompt:**
Update biomarker price lookup to use the selected institution.

**Changes:**
- Thread `institution_id` through `search_biomarkers` and `_fetch_prices`.
- Replace joins on `Item.price_now_grosz` / `Item.is_available` with `InstitutionItem`.

**Files:**
- `apps/api/src/panelyt_api/services/catalog.py`
- `apps/api/src/panelyt_api/api/catalog.py` (accept `institution` query param)

**Acceptance criteria:**
- `/catalog/biomarkers?institution=1135` returns the same prices as before.
- `/catalog/biomarkers?institution=X` reflects that institution’s availability.

---

### Task 09 — Add API endpoints for office search + lookup
**Prompt:**
Expose a backend endpoint that the web app can use to search offices.

**Endpoints:**
- `GET /institutions/search?q=...&page=...&limit=...`
  - Proxies Diagnostyka, normalizes response.
- (Optional) `GET /institutions/{id}`

**Files:**
- `apps/api/src/panelyt_api/api/institutions.py` (new)
- `apps/api/src/panelyt_api/api/router.py` (register router)
- `apps/api/src/panelyt_api/schemas/institutions.py` (new)

**Acceptance criteria:**
- Search returns stable fields: `{id, name, city, address}`.
- Pagination parameters are respected.
- Errors from upstream are converted to 502/503 with safe messaging.

---

### Task 10 — Extend account settings with preferred office (read + write)
**Prompt:**
Add preferred institution to account settings and allow updating it.

**Changes:**
- `/account/settings` returns `preferred_institution_id` (+ optional rendered label).
- Add `PATCH /account/settings` (or `POST /account/settings`) accepting `{preferred_institution_id}`.
- On update:
  - ensure institution exists in DB (via `InstitutionService`)
  - if changed, clear saved list totals + notification baselines for that user.

**Files:**
- `apps/api/src/panelyt_api/api/account.py`
- `apps/api/src/panelyt_api/schemas/account_settings.py`
- `apps/api/src/panelyt_api/db/models.py` (already in Task 02)

**Acceptance criteria:**
- Setting preferred office persists to `user_account.preferred_institution_id`.
- Switching office resets saved-list cached totals.
- `apps/api/tests/test_account_settings_endpoints.py` updated and passing.

---

### Task 11 — Make saved list totals institution-aware (create/update)
**Prompt:**
Saved lists cache `last_known_total_grosz` during create/update. After multi-office support, those totals must match the user-selected office.

**Changes:**
- Thread `institution_id` into `SavedListService._refresh_list_totals(...)`.
- Resolve `institution_id` from the user’s preferred office (fallback 1135) in:
  - `POST /lists` (create)
  - `PUT /lists/{id}` (update)
- Call `OptimizationService.solve(..., institution_id=...)`.

**Files:**
- `apps/api/src/panelyt_api/api/saved_lists.py`
- `apps/api/src/panelyt_api/services/saved_lists.py`
- `apps/api/src/panelyt_api/optimization/service.py` (solve signature)

**Acceptance criteria:**
- Creating a list under institution A stores totals for institution A.
- Updating preferred office + editing list updates totals for the new institution.
- `apps/api/tests/test_saved_lists_endpoints.py` updated and passing.

---

### Task 12 — Update Telegram price alerts to use preferred institution
**Prompt:**
Ensure Telegram price-drop checks run against the correct institution.

**Changes:**
- When evaluating a candidate list, resolve `institution_id` from the owning user.
- Call optimization with that institution.

**Files:**
- `apps/api/src/panelyt_api/services/alerts.py`

**Acceptance criteria:**
- Alerts still send for price drops.
- Two users with different preferred institutions can receive different totals for the same biomarker list.
- `apps/api/tests/test_price_alerts.py` updated and passing.

---

## Frontend (apps/web + packages/types)

### Task 13 — Add shared types for institutions + account settings
**Prompt:**
Update `@panelyt/types` to include:
- `Institution` schema
- `InstitutionSearchResponse` schema
- `AccountSettings` includes `preferred_institution_id` (+ optional label)

**Files:**
- `packages/types/src/index.ts`

**Acceptance criteria:**
- Type build passes.
- Web app compiles with updated account settings type.

---

### Task 14 — Create a persisted office-selection store + hook
**Prompt:**
Implement a small zustand store for selected office:
- state: `institutionId`, `label`
- action: `setInstitution({id, label})`
- persistence: localStorage (or sessionStorage) key like `panelyt:selected-institution`

Integrate with account settings:
- On load, if account settings has preferred institution, initialize store.
- On selection change, call the account settings update endpoint.

**Files:**
- `apps/web/src/stores/institutionStore.ts` (new)
- `apps/web/src/hooks/useInstitution.ts` (new)
- `apps/web/src/hooks/useAccountSettings.ts` (extend with update mutation)

**Acceptance criteria:**
- Store survives refresh.
- Logged-in users persist selection server-side.
- Anonymous users still have a stable selection client-side.

---

### Task 15 — Add an OfficeSelector UI component
**Prompt:**
Build a compact searchable selector:
- input to search offices
- list of results
- click selects an office
- shows current selection label

Place it in the global Header (desktop) and/or Account page.

**Files:**
- `apps/web/src/components/office-selector.tsx` (new)
- `apps/web/src/components/header.tsx` (wire it)
- `apps/web/src/app/[locale]/account/account-content.tsx` (optional: also render there)

**Acceptance criteria:**
- Works with keyboard navigation.
- Selection updates store and triggers server update.
- Does not significantly increase header height on mobile.

---

### Task 16 — Thread institution into optimization + template pricing requests
**Prompt:**
Update all POST /optimize calls to include `institution`.

**Changes:**
- `useOptimization` queryKey includes institution id.
- `useAddonSuggestions` queryKey includes institution id.
- `useTemplatePricing` uses institution id in queryKey (replace the existing `null` placeholder).
- Requests hit `/optimize?institution=<id>` and `/optimize/addons?institution=<id>`.

**Files:**
- `apps/web/src/hooks/useOptimization.ts`
- `apps/web/src/hooks/useBiomarkerListTemplates.ts`

**Acceptance criteria:**
- Switching office changes totals without requiring a hard refresh.
- React-query does not reuse cached results across institutions.

---

### Task 17 — Thread institution into catalog search + biomarker lookup
**Prompt:**
Ensure all catalog calls that depend on price/availability use the selected institution.

**Files to update (at minimum):**
- `apps/web/src/hooks/useBiomarkerLookup.ts`
- `apps/web/src/hooks/useUrlBiomarkerSync.ts`
- `apps/web/src/hooks/useBiomarkerDiagUrls.ts`
- any search/autocomplete hook used by the optimizer search box

**Acceptance criteria:**
- Searching biomarkers reflects availability for the selected office.
- Prefilling biomarkers from URL still works.

---

### Task 18 — Cache invalidation + UX polish when office changes
**Prompt:**
When the office changes:
- invalidate optimization-related queries
- clear `panelStore.lastOptimizationSummary`
- optionally toast a subtle “Office changed” message

**Files:**
- `apps/web/src/stores/panelStore.ts` (add action to clear summary)
- `apps/web/src/hooks/useInstitution.ts` (trigger invalidations)

**Acceptance criteria:**
- No stale totals remain visible after office switch.
- UI updates feel immediate.

---

## Tests + QA

### Task 19 — Update API tests for institution-aware behavior
**Prompt:**
Update/add tests to cover:
- ingestion writes to `institution_item`
- optimization reads from `institution_item`
- catalog biomarker prices use `institution_item`
- account settings update preferred institution
- saved list totals use preferred institution

**Files:**
- `apps/api/tests/test_ingestion_repository.py`
- `apps/api/tests/test_optimization_service.py`
- `apps/api/tests/test_services_catalog.py`
- `apps/api/tests/test_account_settings_endpoints.py`
- `apps/api/tests/test_saved_lists_endpoints.py`

**Acceptance criteria:**
- Full API test suite passes.

---

### Task 20 — Update web tests for office selection wiring
**Prompt:**
Add minimal coverage:
- OfficeSelector renders and can select an option.
- Template pricing query keys include institution.
- Optimization hook query keys include institution.

**Files:**
- `apps/web/src/components/__tests__/...`
- `apps/web/src/hooks/__tests__/...`

**Acceptance criteria:**
- `pnpm test` passes for web.

---

### Task 21 — Manual QA checklist
**Prompt:**
Add a short QA checklist to the PR description or a docs file.

Checklist:
- Select office A → optimizer totals change
- Select office B → optimizer totals change again, no stale cache
- Templates page totals change when switching office
- Saved lists totals match selected office
- Toggling telegram alerts still works
- Scheduled ingestion runs on active institutions only

**Acceptance criteria:**
- Checklist exists and is used during review.
