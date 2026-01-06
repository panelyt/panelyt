# Panelyt Redesign – Implementation Plan (Agentic, Batch-Oriented)

**Target**: Implement the redesign described in **Panelyt UX + Visual Redesign Spec (v2)**  
**Spec file**: `panelyt-redesign-spec-v2.md` (Last updated: 2026-01-05)  
**Codebase**: `apps/web` (Next.js + Tailwind + next-intl + React Query)  
**Plan version**: 1.0 (2026-01-05)

---

## How to use this plan

- Work in small PRs aligned to the **batches** below.
- Each batch includes:
  - **Spec references** (section numbers from `panelyt-redesign-spec-v2.md`)
  - **Primary files/areas** to touch in this repo
  - **Bite-sized tasks** (checkboxes)
  - **Acceptance criteria** (what “done” means)
- Follow repo checks after each batch:
  - `make typecheck-web`
  - `make lint-web`
  - `make test-web`

> This plan intentionally follows the rollout strategy in Spec **§13**, while still preparing shared foundations early (Spec **§10**).

---

## Global guardrails (must hold for every batch)

**From Spec §2, §8, §9**
- No functionality removal; only reorganize/augment (Spec §2).
- All UI strings + aria labels via `next-intl` (Spec §9, §6.3).
- Keyboard + focus correctness for dialogs/menus (Spec §8).
- Responsive behaviors per breakpoints (Spec §4.2).
- URL params must continue to work: `?biomarkers`, `?template`, `?shared`, `?list` (Spec Appendix A).

**Repo context**
- Header is used on all pages (`apps/web/src/components/header.tsx`).
- Optimizer orchestration is in `apps/web/src/app/[locale]/home-content.tsx`.
- Solver compare endpoint is already used via `useLabOptimization` (`apps/web/src/hooks/useLabOptimization.tsx`).
- Lists/Templates pages are in:
  - `apps/web/src/app/[locale]/lists/lists-content.tsx`
  - `apps/web/src/app/[locale]/collections/collections-content.tsx`

---

## Batch 0 — Prep, dependency adds, and scaffolding

### Outcome
Create the minimal tooling foundation needed for the redesign component architecture and UX patterns.

### Spec references
- Engineering guidance: **§10.1–§10.4**
- Toasts: **§6.1**
- A11y: **§8**

### Files / areas
- `apps/web/package.json`
- `apps/web/src/app/providers.tsx`
- `apps/web/src/lib/*` (new)
- `apps/web/src/ui/*` (new folder)

### Tasks
- [ ] **Add dependencies** (Spec §10.1, §10.4, §6.1):
  - [ ] `zustand`
  - [ ] `class-variance-authority`
  - [ ] `sonner`
  - [ ] Radix primitives: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-popover`, `@radix-ui/react-tabs`
  - [ ] (Optional, Spec §6.2) `cmdk`
- [ ] Create `apps/web/src/lib/cn.ts` using `clsx` + `tailwind-merge` (Spec §10.1).
- [ ] Add `apps/web/src/ui/README.md` describing conventions:
  - variants with CVA
  - “no hard-coded copy” rule (Spec §6.3 / §9)
- [ ] Add Sonner `<Toaster />` in `apps/web/src/app/providers.tsx` (Spec §6.1).
- [ ] Add a lightweight `apps/web/src/lib/analytics.ts` wrapper (stub; full events later) (Spec §12):
  - `track(eventName, payload?)` that safely no-ops on SSR and when Umami is absent.

### Acceptance criteria
- `pnpm --filter @panelyt/web dev` runs without dependency errors.
- `make typecheck-web && make lint-web && make test-web` pass.
- `Toaster` renders (manual check) and does not break SSR.

---

## Batch 1 — Visual tokens + shared UI primitives

### Outcome
Introduce the design-system layer and baseline styling rules to build redesigned screens consistently.

### Spec references
- Visual system: **§5.1–§5.6**
- Components guidance: **§10.1**
- A11y: **§8**

### Files / areas
- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`
- New: `apps/web/src/ui/*`

### Tasks
- [ ] Update `globals.css` to be **dark-first** (Spec §5.2):
  - [ ] Set `color-scheme: dark` as default.
  - [ ] Ensure `body` defaults to `bg.app` + `text.primary`.
  - [ ] Add subtle background grid texture (Spec §5.3) using CSS background-image at low contrast.
  - [ ] Add strong, consistent focus ring utility (Spec §8).
- [ ] Add/extend Tailwind theme tokens for:
  - [ ] accent colors (cyan/emerald/amber/red) (Spec §5.2)
  - [ ] radii & shadows used for modals/selected emphasis (Spec §5.4)
- [ ] Implement UI primitives (Spec §10.1) in `apps/web/src/ui/`:
  - [ ] `Button` (primary/secondary/destructive; sizes; loading state)
  - [ ] `IconButton`
  - [ ] `Card` (surface variants)
  - [ ] `Chip` (selected/bonus/warn variants)
  - [ ] `Dialog` wrapper on Radix (focus trap, esc close) (Spec §8, §10.4)
  - [ ] `DropdownMenu` wrapper on Radix (Spec §10.4)
  - [ ] `Tooltip` wrapper on Radix (focus + hover) (Spec §8)
  - [ ] `SegmentedControl` (used for Lab tabs styling) (Spec §10.1)
  - [ ] `Table` (dense, sticky header option) (Spec §5.6)
- [ ] Add `ui` unit tests for at least `Button` + `Dialog` keyboard basics (vitest + testing-library).

### Acceptance criteria
- All primitives are importable and used by at least one internal demo (can be a temporary story-like page or a small dev-only component).
- Dialogs trap focus and close on `Esc`.
- Tooltips appear on focus + hover and do not block primary workflows.

---

## Batch 2 — Panel selection store (global) + migration adapters

### Outcome
Adopt a single global panel selection store persisted to **sessionStorage**, ready for Panel Tray and cross-page usage.

### Spec references
- Panel Tray data source: **§4.3**
- State management: **§10.2**
- URL params remain supported: **Appendix A**

### Files / areas
- New: `apps/web/src/stores/panelStore.ts`
- Update or replace: `apps/web/src/hooks/useBiomarkerSelection.ts`
- Integration points:
  - `apps/web/src/app/[locale]/home-content.tsx`
  - `apps/web/src/hooks/useUrlBiomarkerSync.ts`
  - `apps/web/src/hooks/useUrlParamSync.ts`

### Tasks
- [ ] Implement `usePanelStore` (Zustand) with `persist` to `sessionStorage` (Spec §10.2):
  - state:
    - [ ] `selected: {code, name}[]`
    - [ ] `lastOptimizationSummary?: { labCode, totalNow, totalMin30, uncoveredCount, updatedAt }` (optional cache pointer; Spec §10.2)
  - actions:
    - [ ] `addOne(biomarker)`
    - [ ] `addMany(biomarkers)` (used for paste + template append)
    - [ ] `remove(code)`
    - [ ] `clearAll()`
    - [ ] `replaceAll(biomarkers)` (template replace / list load)
- [ ] Keep storage key compatible with current session storage when possible:
  - current key: `panelyt:selected-biomarkers` (see `useBiomarkerSelection.ts`)
- [ ] Create a small adapter hook to minimize churn:
  - [ ] Option A: rewrite `useBiomarkerSelection` to read/write `usePanelStore` but keep the same return shape used by Home (temporary).
  - [ ] Option B: update Home immediately to store usage, and delete/deprecate `useBiomarkerSelection`.
- [ ] Update URL sync hooks usage in Optimizer flow to call store actions:
  - `useUrlParamSync` callbacks → `replaceAll(...)` (Spec Appendix A)
  - `useUrlBiomarkerSync.onLoadFromUrl` → `replaceAll(...)`
- [ ] Add store unit tests:
  - [ ] persist/load correctness in a jsdom environment
  - [ ] append does not duplicate codes
  - [ ] replaceAll replaces order deterministically

### Acceptance criteria
- Biomarker selection persists across refresh **in session** (same behavior as today).
- URL loading flows (`?biomarkers`, `?template`, `?shared`, `?list`) still populate selection.
- No regressions to `/optimize/compare` calls (still driven by selected codes).

---

# Phase 1 (Spec §13) — Optimizer redesign

## Batch 3 — Optimizer layout: two-rail + sticky summary bar skeleton

### Outcome
Restructure Optimizer UI into the two-rail layout and add a sticky summary bar container (without full feature completeness yet).

### Spec references
- Optimizer layout: **§7.1.2**
- Sticky summary bar: **§7.1.3**
- Visual rules: **§5**

### Files / areas
- `apps/web/src/app/[locale]/home-content.tsx`
- New: `apps/web/src/features/optimizer/*` (recommended, Spec §10.1)

### Tasks
- [ ] Create `features/optimizer/OptimizerLayout.tsx`:
  - [ ] Desktop grid: left 40% / right 60% (Spec §7.1.2)
  - [ ] Responsive stacking for < 1024px (Spec §4.2)
- [ ] Create `features/optimizer/StickySummaryBar.tsx` (structure only):
  - [ ] Visible when selection non-empty
  - [ ] Placeholder slots for: best lab, total, coverage status, actions (Spec §7.1.3)
- [ ] Move current “Build panel” UI into left rail; results into right rail.
- [ ] Replace ad-hoc card wrappers with `ui/Card` and `ui/Button` variants for consistent styling.

### Acceptance criteria
- Optimizer page matches the two-rail layout on XL.
- On MD/SM, layout stacks and remains usable.
- No behavior regressions: selection still updates optimization results.

---

## Batch 4 — Search/typeahead upgrades + paste/multi-add

### Outcome
Make selection entry faster via improved search and paste list workflow.

### Spec references
- Search/typeahead: **§7.1.4**
- Keyboard: **§6.2**
- No hard-coded copy: **§6.3 / §9**

### Files / areas
- `apps/web/src/components/search-box.tsx` (likely refactor to `features/optimizer/SearchBox`)
- New: `apps/web/src/features/optimizer/PasteCodesDialog.tsx`
- i18n: `apps/web/src/i18n/messages/en.json`, `pl.json`

### Tasks
- [ ] Refactor search into Optimizer feature component that:
  - [ ] Keeps current suggestion behaviors (templates + biomarkers)
  - [ ] Adds grouping headers (“Biomarkers”, “Templates”) (Spec §7.1.4)
  - [ ] Uses combobox/listbox ARIA semantics (Spec §8)
- [ ] Implement `/` key to focus search input on Optimizer (Spec §6.2):
  - [ ] Do not trigger when user is typing in an input/textarea.
- [ ] Implement “Paste list” dialog (Spec §7.1.4):
  - [ ] Textarea that accepts comma/newline separated codes
  - [ ] Normalization: trim, uppercase, de-dupe
  - [ ] Apply action uses `panelStore.addMany(...)`
  - [ ] Toast: “Added N biomarkers” (Spec §6.1)
- [ ] Add i18n keys for:
  - [ ] grouping headers
  - [ ] paste dialog title/help/cta
  - [ ] paste parse errors (empty / too long)
- [ ] Add tests:
  - [ ] paste parsing (unit)
  - [ ] keyboard “/” focuses input (component test)

### Acceptance criteria
- User can paste a list and see the correct number of chips added (no duplicates).
- Search remains keyboard navigable (arrows, enter, esc).
- All new copy is translated.

---

## Batch 5 — Selected biomarkers component upgrades (chips, clear, undo optional)

### Outcome
Upgrade the selection display and actions area to match redesigned UX.

### Spec references
- Selected biomarkers: **§7.1.5**
- Terminal cues: **§5.3**

### Files / areas
- `apps/web/src/components/selected-biomarkers.tsx` (refactor)
- New: `apps/web/src/features/panel/SelectedChips.tsx` (optional structure)
- Store: `apps/web/src/stores/panelStore.ts`

### Tasks
- [ ] Redesign chips:
  - [ ] Primary line display name
  - [ ] Secondary mono code shown on hover/focus or in tray (Spec §5.1 / §5.3)
  - [ ] Remove button is keyboard reachable and has i18n aria-label
- [ ] Add “Clear all” action with confirm dialog when non-empty (Spec §7.1.5):
  - [ ] Uses `ui/Dialog`
  - [ ] Calls `panelStore.clearAll()`
- [ ] (Optional) Implement “Undo last remove” toast action (Spec §7.1.5 says optional):
  - [ ] Store keeps `lastRemoved` snapshot for 10s.

### Acceptance criteria
- Removing chips updates optimization (no stale UI).
- Clear all requires confirmation and does not crash.
- Chips remain readable and accessible with keyboard.

---

## Batch 6 — Results: lab comparison + addons + coverage gaps

### Outcome
Recompose the right rail into clearer sections: lab compare, addons, coverage gaps, and order breakdown.

### Spec references
- Lab comparison: **§7.1.6**
- Add-ons: **§7.1.7**
- Coverage gaps: **§7.1.8**
- Price breakdown: **§7.1.9**

### Files / areas
- `apps/web/src/components/optimization-results/*`
- `apps/web/src/hooks/useLabOptimization.tsx`
- New: `apps/web/src/features/optimizer/CoverageGaps.tsx`

### Tasks
- [ ] Update “Best prices” lab tabs UI to use `ui/SegmentedControl` styling:
  - [ ] Show “not available” state clearly (Spec §7.1.6)
  - [ ] Add tooltip showing missing token list when missing > 0 (Spec §7.1.6, §8)
    - Use `LabCard.missing.tokens` from `useLabOptimization`
- [ ] Add “Coverage gaps” section (Spec §7.1.8):
  - [ ] Render when `activeResult.uncovered.length > 0`
  - [ ] Show list of uncovered codes with mono styling
  - [ ] Provide actions:
    - [ ] “Remove from panel” (removes code)
    - [ ] “Search alternatives” (focus search with the code prefilled) — if feasible; otherwise defer
- [ ] Ensure Add-on suggestions remains append-only:
  - [ ] Use store `addMany` with toast feedback (Spec §7.1.7)
  - [ ] Keep lazy load behavior (`useAddonSuggestions`) (Spec §10.3)
- [ ] Keep/confirm “Price breakdown” layout but update styling to match new card system (Spec §7.1.9).
- [ ] Add “result update highlight” effect on totals change (Spec §5.5).

### Acceptance criteria
- Selecting labs updates coverage gaps and breakdown consistently.
- Missing tokens tooltip is accessible and never blocks core flows.
- Add-on apply shows a toast and adds biomarkers without duplicates.

---

## Batch 7 — Optimizer notice/error handling + toasts standardization

### Outcome
Replace inline transient states with consistent toast feedback while preserving hard errors.

### Spec references
- Toasts: **§6.1**
- Error handling: **§7.1.10**

### Files / areas
- `apps/web/src/app/[locale]/home-content.tsx`
- `apps/web/src/hooks/useBiomarkerSelection.ts` (if still present)
- `apps/web/src/components/optimization-results/addon-suggestions-collapsible.tsx`

### Tasks
- [ ] Replace:
  - [ ] share “copied” local state → toast (Spec §6.1)
  - [ ] selection “notice” auto-dismiss UI → toast
- [ ] Keep persistent error surfaces where appropriate:
  - [ ] network errors rendering in results
  - [ ] auth-required errors (save list)
- [ ] Ensure “errors never clear selection” rule holds (Spec §7.1.10).
- [ ] Add i18n keys for new toast messages.

### Acceptance criteria
- No inline “flash” states are left except persistent errors.
- Toasts are i18n-driven and accessible.

---

# Phase 2 (Spec §13) — Panel Tray + Lists redesign

## Batch 8 — Panel Tray (global panel summary) + Header/menu upgrades

### Outcome
Provide persistent panel access across the app and modernize header interactions.

### Spec references
- Panel Tray: **§4.3**
- Navigation behavior: **§3.3**
- Replace popovers/modals: **§10.4**
- Keyboard: **§6.2**

### Files / areas
- `apps/web/src/components/header.tsx` (refactor)
- New: `apps/web/src/features/panel/PanelTray.tsx`
- New: `apps/web/src/features/panel/PanelPill.tsx`
- `apps/web/src/stores/panelStore.ts`
- Modals: `SaveListModal`, `AuthModal` (convert to Radix Dialog)

### Tasks
- [ ] Implement `PanelPill` in header (desktop) (Spec §4.3):
  - [ ] Shows count + (if available) best total or “Run optimize”
  - [ ] Status icon: ✅ / ⚠ / ⏳ (Spec §4.3)
- [ ] Implement tray as Radix `Dialog` (slide-over on desktop, full-screen on mobile):
  - [ ] Selected biomarker chips with remove
  - [ ] Quick actions: Open Optimizer, Share URL, Save list (Spec §4.3)
- [ ] Implement mobile bottom sticky bar that opens tray (Spec §4.3, §4.2).
- [ ] Update Header account area to use dropdown menu (Spec §3.3):
  - [ ] Logged-in: Account, Sign out
  - [ ] Logged-out: Sign in / Register (current behavior preserved)
- [ ] Migrate `LoadMenu` usage to Radix DropdownMenu (Spec §10.4):
  - [ ] Either replace component globally or create `ui/DropdownMenu` usage per page.
- [ ] Convert `AuthModal` and `SaveListModal` to `ui/Dialog` (Spec §10.4, §8).
- [ ] Ensure `/` focuses search inside tray when open (Spec §6.2).

### Acceptance criteria
- Tray is accessible on Templates, Lists, Account (Spec §4.3 acceptance criteria).
- Removing a biomarker in tray updates store and (if on Optimizer) updates results (Spec §4.3 acceptance criteria).
- Header menus and dialogs are keyboard-correct (tab order, esc closes).

---

## Batch 9 — Lists page redesign (dense table + bulk actions)

### Outcome
Replace the card list UI with a dense, fast table on desktop and responsive cards on mobile.

### Spec references
- Lists: **§7.3.1–§7.3.3**
- Visual/table rules: **§5.6**
- Toasts: **§6.1**

### Files / areas
- `apps/web/src/app/[locale]/lists/lists-content.tsx`
- `apps/web/src/hooks/useSavedLists.ts`
- `apps/web/src/ui/Table.tsx` (from Batch 1)

### Tasks
- [ ] Implement desktop table layout (Spec §7.3.2):
  - columns: Name, Biomarkers count, Total, Alerts, Share, Actions
  - row actions via dropdown: Load, Copy share, Regenerate, Disable share, Delete
- [ ] Add top summary strip (Spec §7.3.2):
  - lists count
  - alerts enabled count
  - “Last updated” metadata (derived from `last_total_updated_at` or `updated_at`)
- [ ] Keep bulk alerts toggle but redesign as a clear primary/secondary button set.
- [ ] Replace “copy link” inline state with toast (Spec §6.1).
- [ ] On “Load in Optimizer”:
  - [ ] call `panelStore.replaceAll(list.biomarkers...)`
  - [ ] navigate to `/` (or locale-aware `/` via router) with no extra query param
  - [ ] (Optional) also update URL `?biomarkers=...` when arriving on Optimizer
- [ ] Mobile layout (Spec §7.3.3):
  - [ ] cards or stacked rows with primary actions visible

### Acceptance criteria
- All existing list actions still exist (share/unshare/regenerate/delete/alerts).
- Table remains readable at 1280px width and degrades to mobile.
- Loading a list truly updates the global panel and is reflected in Panel Tray.

---

# Phase 3 (Spec §13) — Templates + Account + Privacy

## Batch 10 — Templates list redesign + apply-to-panel actions

### Outcome
Make Templates page faster to scan and apply to the current panel, while preserving admin operations.

### Spec references
- Templates: **§7.2.1–§7.2.3**
- Global panel invariant: **§3.2**
- Panel tray: **§4.3**

### Files / areas
- `apps/web/src/app/[locale]/collections/collections-content.tsx`
- `apps/web/src/components/template-modal.tsx` (convert to Dialog)
- `apps/web/src/hooks/useBiomarkerListTemplates.ts` (data)
- Store: `apps/web/src/stores/panelStore.ts`

### Tasks
- [ ] Replace template grid with compact list/table (Spec §7.2.2):
  - [ ] search/filter input
  - [ ] sort options (updated desc default; active only for non-admin)
  - [ ] show: name, biomarker count, updated time, price summary
- [ ] Inline expansion row (Spec §7.2.3):
  - [ ] preview first ~10 biomarkers + “+N more”
  - [ ] quick buttons: “Add to panel” (append), “Replace panel”
- [ ] Admin controls preserved:
  - [ ] edit template opens Dialog (Radix) (Spec §10.4)
  - [ ] delete confirmation dialog
- [ ] Applying template triggers analytics + toast:
  - [ ] `panel_apply_template` with `mode: append|replace` (Spec §12)

### Acceptance criteria
- Non-admin users only see active templates.
- Admin can still edit/delete.
- Apply template updates Panel Tray immediately without navigating home.

---

## Batch 11 — Template details page: Add/Replace + improved layout polish

### Outcome
Keep the existing split detail structure but add explicit panel actions and align styling with the redesign.

### Spec references
- Template details: **§7.2.4**

### Files / areas
- `apps/web/src/app/[locale]/collections/[slug]/template-detail-content.tsx`

### Tasks
- [ ] Add “Add to panel” and “Replace panel” buttons near template metadata (Spec §7.2.4).
- [ ] On action:
  - [ ] call store `addMany` or `replaceAll`
  - [ ] toast confirmation
  - [ ] provide “Open Optimizer” secondary action
- [ ] Ensure results section uses updated `OptimizationResults` styling consistently.

### Acceptance criteria
- User can apply from detail view without hunting for Optimizer.
- No regressions in template pricing display.

---

## Batch 12 — Account + Privacy styling updates

### Outcome
Apply the new visual system and spacing to Account and Privacy while preserving existing flows.

### Spec references
- Account: **§7.4**
- Privacy: **§7.5**
- Visual system: **§5**

### Files / areas
- `apps/web/src/app/[locale]/account/account-content.tsx`
- `apps/web/src/app/[locale]/privacy/privacy-content.tsx`

### Tasks
- [ ] Account page:
  - [ ] emphasize Telegram connection status card
  - [ ] tighten typography + spacing to match cards/tables
  - [ ] ensure “Open bot” and “Copy command” use standard buttons
  - [ ] add toast for “copied command” and “opened bot” (Spec §12 event: `telegram_link_opened`)
- [ ] Privacy page:
  - [ ] typography + content width polish only (no content changes)
  - [ ] ensure links have consistent styling

### Acceptance criteria
- Telegram linking still works exactly as before.
- Privacy text unchanged except styling.

---

# Cross-cutting completion work

## Batch 13 — Analytics events (minimum set)

### Outcome
Emit all required analytics events from the redesigned interactions.

### Spec references
- Analytics events list: **§12**
- Success metrics: **§1.3**

### Files / areas
- `apps/web/src/lib/analytics.ts`
- Interaction points across Optimizer/Templates/Lists/Account

### Tasks
- [ ] Implement `track()` wrapper for Umami (script already present in `src/app/layout.tsx`).
- [ ] Emit events (Spec §12):
  - [ ] `panel_add_biomarker`
  - [ ] `panel_remove_biomarker`
  - [ ] `panel_apply_template` (append vs replace)
  - [ ] `panel_apply_addon`
  - [ ] `optimize_result_rendered` (labChoice, total, uncoveredCount)
  - [ ] `share_copy_url` (success/failure)
  - [ ] `save_list_submit` (success/failure)
  - [ ] `alerts_toggle` (single/bulk)
  - [ ] `telegram_link_opened`
- [ ] Add “TTOR” measurement hooks (Spec §1.3):
  - [ ] mark timestamp at first biomarker added (when selection was empty)
  - [ ] mark timestamp when optimization result is rendered for current selection
  - [ ] send derived duration via `optimize_result_rendered`

### Acceptance criteria
- Events fire without throwing errors when analytics is absent (dev mode).
- Payloads are stable and avoid PII.

---

## Batch 14 — QA, accessibility audit, and regression checklist

### Outcome
Finalize as production-ready.

### Spec references
- Constraints: **§2**
- Accessibility: **§8**
- i18n rules: **§9**

### Tasks
- [ ] Create a manual regression checklist doc in `apps/web/QA-REDESIGN.md`:
  - [ ] URL param loads: template/shared/list/biomarkers
  - [ ] lab compare toggling
  - [ ] add-on apply
  - [ ] save/share
  - [ ] lists alerts + share flows
  - [ ] template admin edit/delete
  - [ ] account telegram link flows
- [ ] Add/extend vitest tests for:
  - [ ] Panel store persistence
  - [ ] Dialog focus trap & esc close
  - [ ] Search keyboard behaviors
- [ ] Run `make check` locally (full suite).
- [ ] Do a quick a11y pass:
  - [ ] keyboard-only navigation
  - [ ] focus visible
  - [ ] contrast checks for key surfaces
- [ ] Verify i18n: run app in `pl` and `en` and confirm new keys exist.

### Acceptance criteria
- All automated checks pass.
- Manual checklist is green for desktop + mobile breakpoints.

---

# Optional work (Spec §11) — Backend enhancements

## Batch 15 — Lists “refresh totals” endpoint

### Outcome
Support a better Lists UX by allowing explicit refresh of cached totals.

### Spec references
- Backend changes: **§11**

### Files / areas
- `apps/api` (FastAPI)
- `packages/types` (schemas)
- `apps/web/src/hooks/useSavedLists.ts` (client)

### Tasks
- [ ] API: implement `POST /lists/{id}/refresh`:
  - [ ] recompute `last_known_total_grosz` and `last_total_updated_at`
  - [ ] return updated list data
- [ ] (Optional) API: implement `POST /lists/refresh` (bulk)
- [ ] Types: add request/response schemas in `packages/types`
- [ ] Web: add “Refresh” action per list row and bulk refresh (Spec §7.3.2 synergy)
- [ ] Analytics: track refresh usage (optional, not in Spec §12)

### Acceptance criteria
- Lists totals can be refreshed without re-saving.
- No breaking changes to existing list endpoints.

---

## Notes on PR sizing and sequencing

Recommended PR sequence (mirrors batches):
1) B0 → B1 → B2 (foundations)
2) Phase 1: B3–B7 (Optimizer complete)
3) Phase 2: B8–B9 (Panel Tray + Lists)
4) Phase 3: B10–B12 (Templates + Account + Privacy)
5) B13–B14 (analytics + QA)
6) Optional B15 (backend)

Keep each PR “reviewable”:
- ideally 200–600 lines net change unless it’s a mechanical refactor.
- prefer introducing new components alongside old ones, then swapping imports.

