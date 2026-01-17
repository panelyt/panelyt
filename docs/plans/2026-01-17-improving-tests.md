# Panelyt – Test & Verification Hardening Plan (AI-maintained repo)

This repo is already well-covered in places (especially **apps/api** and **apps/web**), but it’s missing several layers of verification that matter when **most code changes are produced by an AI agent**:

- **Strong, mechanical gates** (coverage thresholds, contract snapshots, mutation score, diff-based “tests required” policy)
- **Hermetic + deterministic tests** (no shared DB files, no shared in-memory caches leaking between tests, stable time)
- **Cross-service contract guarantees** (API schema drift detection; API ↔ types ↔ web compatibility)
- **Integration/E2E confidence** (Postgres + Alembic migration smoke tests; optional Playwright flow tests)
- **Bot test coverage** (currently no automated tests for apps/telegram-bot)

The tasks below are intentionally “single‑PR sized” and ordered so you can start getting stricter guarantees quickly.

---

## Current state (quick findings)

### Backend (apps/api)
- Uses **pytest** + **pytest-asyncio** with an SQLite file DB (`test.db`) created/dropped per test via `db_session` fixture.
- Many endpoint + service tests exist, but **test isolation relies on manual cache clears** in some files.
- CI runs `just check` which runs `pytest` but **does not enforce coverage thresholds**.
- Some tests use real `datetime.now()` (fine, but makes it harder to add fuzzing/randomization later).
- **Duplicate test** exists in `apps/api/tests/test_ingest_client.py` (same test name appears twice).

### Frontend (apps/web)
- Good unit/component coverage via **Vitest**.
- CI runs `vitest run`, but **no coverage reporting/thresholds**.
- No browser-level E2E test layer.

### Telegram bot (apps/telegram-bot)
- No test suite (no `pytest` dependency, no `tests/` directory).

---

## Implementation plan

### Legend
- **P0** = immediate guardrails (strong ROI)
- **P1** = strengthens correctness + isolation
- **P2** = deeper confidence (integration/E2E/mutation)

Each task includes an acceptance checklist so you can enforce completion.

---

## Epic A – CI quality gates (strict verification)

### A1 (P0) Add backend coverage measurement + fail-under threshold
**Goal:** Prevent silent test erosion.

- Update `just _test-api` to run `pytest` with coverage:
  - `--cov=panelyt_api --cov-report=term-missing --cov-report=xml --cov-fail-under=<threshold>`
- Start with a threshold that passes today (e.g. **70%**) then raise gradually.

**Acceptance criteria**
- `just test api` prints a coverage summary.
- CI fails if coverage drops below threshold.
- `apps/api/coverage.xml` is generated in CI.

---

### A2 (P0) Upload coverage artifacts in CI
**Goal:** Make verification auditable.

- In `.github/workflows/ci.yml`, upload:
  - `apps/api/coverage.xml`
  - (later) web coverage output

**Acceptance criteria**
- CI artifacts include coverage files.
- Developers can download and inspect coverage from CI.

---

### A3 (P0) Add frontend coverage (Vitest) + fail-under threshold
**Goal:** Prevent untested UI logic changes from landing.

- Add `@vitest/coverage-v8` dev dependency.
- Add `test:coverage` script in `apps/web/package.json`.
- Configure coverage thresholds (start low, raise).

**Acceptance criteria**
- `pnpm --filter @panelyt/web test:coverage` works locally.
- CI reports web coverage and fails below threshold.

---

### A4 (P0) Add “tests-required” diff gate for AI changes
**Goal:** Ensure AI doesn’t change production code without updating/adding tests.

- Add a CI script (e.g. `scripts/ci/require-tests.sh`) that:
  - Detects changed files under `apps/api/src/**` and `apps/web/src/**`.
  - Fails if no corresponding test files changed under `apps/api/tests/**` / `apps/web/**/__tests__/**`.
  - Allow an explicit escape hatch:
    - commit message contains `[no-tests-ok]`, or
    - PR title contains `no-tests-ok`.

**Acceptance criteria**
- A PR that changes production code but not tests fails CI.
- A PR with the explicit escape hatch passes.
- Script outputs which files triggered the failure.

---

### A5 (P0) Lock down snapshot updates
**Goal:** Stop an AI agent from “updating snapshots” to make tests pass.

- For any snapshot-style tests introduced (OpenAPI, golden results, etc.):
  - Require `UPDATE_SNAPSHOTS=1` env var to rewrite snapshots.
  - CI must run with `UPDATE_SNAPSHOTS` unset.

**Acceptance criteria**
- Snapshot changes fail CI unless intentionally updated.

---

## Epic B – Backend test isolation + determinism

### B1 (P0) Remove duplicate test in `test_ingest_client.py`
**Goal:** Reduce noise + prevent confusing failures.

- Delete the repeated `test_parse_institution_reads_slug_and_city_slug` block.

**Acceptance criteria**
- File contains only one copy of the test.
- `pytest` collection shows no duplicate names.

---

### B2 (P0) Make SQLite DB per-test (or per-worker) using `tmp_path`
**Goal:** Enable parallelization and prevent state leaks.

- Update `db_session` fixture to create a unique DB path:
  - `sqlite+aiosqlite:///{tmp_path}/test.db`
- Stop deleting a shared `test.db` from repo root.

**Acceptance criteria**
- Running tests twice doesn’t reuse the same DB file.
- No test creates or deletes `./test.db` in project root.

---

### B3 (P0) Add an autouse fixture that clears global caches every test
**Goal:** Eliminate hidden coupling between tests.

- In `apps/api/tests/conftest.py`, add `@pytest.fixture(autouse=True)` that calls `clear_all_caches()`.
  - Also clear any caches not covered by `clear_all_caches()`.

**Acceptance criteria**
- Removing test file–local cache clearing does not break other tests.
- Tests pass when run in random order (see next task).

---

### B4 (P1) Randomize test order to detect coupling
**Goal:** Catch order-dependent tests early.

- Add `pytest-randomly`.
- Enable in CI (and locally via `just test api`).

**Acceptance criteria**
- CI runs with randomized order.
- Any order-dependent tests are fixed (no flakiness).

---

### B5 (P1) Make time deterministic where it matters
**Goal:** Prevent flaky edge cases around “now”.

- Add `freezegun` (or `pytest-freezegun`).
- Update tests that care about timestamps to freeze time rather than calling `datetime.now()`.

**Acceptance criteria**
- Tests that assert timestamps use frozen time.
- No flakiness due to clock/tz.

---

### B6 (P1) Introduce factories/builders for DB objects
**Goal:** Reduce repetitive insert dictionaries; reduce AI-generated test mistakes.

- Create `apps/api/tests/factories.py` with helpers like:
  - `make_biomarker(...)`, `make_item(...)`, `attach_offer(...)`, `insert_*` helpers.
- Refactor 2–3 of the most repetitive test modules to use factories.

**Acceptance criteria**
- At least 3 test files switch from raw dict inserts to factories.
- Factories enforce sane defaults (IDs, required fields).

---

## Epic C – Backend contracts + integration confidence

### C1 (P0) Add OpenAPI schema snapshot test
**Goal:** API contract cannot drift silently.

- Add `apps/api/tests/test_openapi_snapshot.py` that:
  - Builds the app (`create_app()`)
  - Calls `app.openapi()`
  - Normalizes ordering (sort keys)
  - Compares to `apps/api/tests/snapshots/openapi.json`
- Add a small helper to update snapshot only when `UPDATE_SNAPSHOTS=1`.

**Acceptance criteria**
- Contract changes show a clear diff.
- CI fails if OpenAPI changes unexpectedly.

---

### C2 (P1) Add Schemathesis fuzz tests against OpenAPI
**Goal:** Catch crashes and schema violations from AI edits.

- Add `schemathesis` as a dev dependency.
- Add a small `tests/test_openapi_fuzz.py` that runs a limited number of generated cases (keep it fast).
  - Focus on non-auth endpoints first, then add auth flows.

**Acceptance criteria**
- CI runs fuzz tests under a strict time budget.
- Any endpoint returning 500 under generated inputs fails CI.

---

### C3 (P1) Postgres + Alembic migration smoke test in CI
**Goal:** SQLite tests won’t catch Postgres-only issues.

- Add a CI job (or extend existing) with a Postgres service container.
- Add `pytest` marker `integration`.
- Write `tests/integration/test_migrations_smoke.py`:
  - Runs `alembic upgrade head` against Postgres
  - Optionally runs `alembic downgrade -1` (if your policy requires reversibility)

**Acceptance criteria**
- Migrations apply cleanly to Postgres in CI.
- Any migration error fails CI.

---

### C4 (P1) Postgres integration tests for repository queries
**Goal:** Confirm key SQL queries behave on the real target DB.

- Add 2–3 integration tests for:
  - candidate collection queries
  - saved list persistence
  - snapshot pruning

**Acceptance criteria**
- Tests run only with `-m integration`.
- Tests validate Postgres semantics (e.g., JSONB fields, constraints).

---

### C5 (P1) Golden end-to-end ingestion test (recorded fixtures)
**Goal:** Prevent ingestion regressions without calling external diag.pl.

- Create JSON fixtures representing diag API responses for:
  - biomarkers
  - items/offers
  - institutions
- Mock HTTPX calls (recommend `respx`).
- Run ingestion against fixtures and assert DB state + computed meta.

**Acceptance criteria**
- Ingestion E2E test is hermetic and deterministic.
- A small fixture set catches mapping/normalization regressions.

---

### C6 (P2) Optimization “golden scenario” tests + invariants
**Goal:** Make business logic changes explicit.

- Add a small set of canonical scenarios (3–5) capturing expected optimizer output.
- Add invariant tests (property-like) asserting:
  - `covered ∪ uncovered == requested`
  - Every covered biomarker appears in `explain`
  - Totals equal sum of returned item prices

**Acceptance criteria**
- Golden scenarios fail loudly when output changes.
- Invariants catch “looks fine but wrong totals” regressions.

---

## Epic D – Deep test quality signals (mutation + property tests)

### D1 (P1) Add Hypothesis property-based tests for utils
**Goal:** Catch edge cases AI often misses.

- Add `hypothesis`.
- Add property tests for:
  - `utils/slugify.py` (idempotent, stable, safe charset)
  - `utils/normalization.py` (whitespace/diacritics invariants)
  - `_pln_to_grosz` / numeric conversions

**Acceptance criteria**
- Tests run quickly (cap examples)
- Finds at least one previously untested edge case (document it).

---

### D2 (P2) Add mutation testing (nightly)
**Goal:** Ensure tests actually detect logic changes.

- Pick a mutation tool:
  - Python: `mutmut` or `cosmic-ray`
  - TS: `stryker`
- Run mutation suite on a schedule (nightly) or manual workflow dispatch.

**Acceptance criteria**
- Mutation report is generated and uploaded.
- A baseline mutation score is recorded.
- CI fails if score drops below baseline (after baseline is established).

---

## Epic E – Frontend confidence (contracts + E2E)

### E1 (P0) Validate API payloads with Zod in hook tests
**Goal:** Tighten API ↔ types contract in the frontend.

- In hooks that consume API responses, ensure tests pass mock responses through `@panelyt/types` Zod schemas.
- Add 2–3 tests where invalid payloads are rejected.

**Acceptance criteria**
- Tests fail if API response shape drifts.

---

### E2 (P1) Add MSW for networked hooks
**Goal:** Replace brittle `global.fetch` mocking with realistic request handling.

- Add `msw` and test utilities.
- Refactor hook tests to use MSW handlers.

**Acceptance criteria**
- Hook tests assert request URLs + query params.
- Less manual mocking boilerplate.

---

### E3 (P2) Add Playwright E2E tests for core flows
**Goal:** Catch integration regressions AI might miss.

Start with 2 smoke tests:
1. Search biomarkers → select → optimize → see results.
2. Save a list and reload page → list persists.

**Acceptance criteria**
- Runs in CI (may be separate job).
- Uses a hermetic backend (seeded DB or mocked API).

---

## Epic F – Telegram bot test suite

### F1 (P0) Add pytest to telegram-bot + create initial test harness
**Goal:** Bring bot under test.

- Add `pytest`, `pytest-asyncio`, `respx` (if needed) to bot dev deps.
- Add `apps/telegram-bot/tests/` and a minimal `conftest.py`.
- Add `just test bot` and wire into `just check`.

**Acceptance criteria**
- `just test bot` runs in CI.
- At least one trivial test passes.

---

### F2 (P1) Unit test bot handlers (command parsing + responses)
**Goal:** Lock down user-visible bot behavior.

- Write tests for `handlers.py`:
  - `/start` behavior
  - link token flow
  - error messages for missing config

**Acceptance criteria**
- Tests assert exact message text (approval/golden style).

---

### F3 (P1) Mock API calls (httpx) + error handling
**Goal:** Ensure bot doesn’t silently break on API changes.

- Use `respx` to mock API responses:
  - success
  - 401/403
  - 5xx
- Assert bot surfaces correct user feedback and logs.

**Acceptance criteria**
- Bot tests cover success + failure paths.

---

## Epic G – Documentation that makes AI safer

### G1 (P0) Add a “Testing Rules” doc the AI agent must follow
**Goal:** Ensure future AI changes consistently include good tests.

Create `docs/testing-rules.md` with:
- When to add unit vs integration vs E2E tests
- Invariants for optimizer + ingestion
- “No prod change without tests” policy
- Snapshot update policy

**Acceptance criteria**
- Linked from `CONTRIBUTING.md`.

---

### G2 (P1) Add PR template + checklist gates
**Goal:** Force explicit verification steps.

- Add `.github/pull_request_template.md` requiring:
  - which tests were added
  - which invariants are protected
  - whether contract snapshot changed

**Acceptance criteria**
- New PRs show checklist by default.

---

### G3 (P1) Add CODEOWNERS for high-risk modules
**Goal:** AI cannot silently rewrite critical logic.

- Require approval for:
  - `apps/api/src/panelyt_api/optimization/**`
  - `apps/api/src/panelyt_api/ingest/**`
  - `.github/**`
  - `infra/**`

**Acceptance criteria**
- GitHub enforces review from specified owners.

---

## Suggested rollout order (fastest path to strict control)
1. **A1 → A4 → B2 → B3 → C1 → F1** (immediate guardrails)
2. **A3 → B4 → C3 → C5 → E1** (contract + integration)
3. **C2 → D1 → E3 → D2** (fuzz + E2E + mutation)

---

## Notes on keeping this AI-friendly
- Prefer **factories** and **golden fixtures**: they reduce the chance an AI writes subtly-invalid test data.
- Prefer **invariants** over brittle exact-output assertions for complex optimization logic.
- Keep slow checks (mutation/E2E) in a separate workflow or nightly schedule, but keep **coverage + contracts** on every PR.

