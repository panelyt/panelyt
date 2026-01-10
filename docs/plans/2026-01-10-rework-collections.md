# /collections — UI/UX crisp refresh (agent-friendly task list)

## Non‑negotiable UX decisions (follow these strictly)
1. **This is a catalog, not a spreadsheet.** Replace the desktop table with a unified **card list** layout.
2. **One clear primary action per template.** Keep **Apply** as primary. Everything else becomes secondary/overflow.
3. **Biomarkers should be visible without layout-jank.** Use **inline chips preview + “Show all”** inside the card. Do not add extra table rows.
4. **Filtering must stay available while scrolling.** Make the toolbar **sticky** under the header.
5. **Loading and empty states must look intentional.** Use skeletons and a clear “no results” state.

---

## Task 01 — Add small UI primitives (Input, Switch, Skeleton)
**Prompt:**
Create 3 reusable UI components:
- `Input`: dark theme input with optional leading icon slot, trailing slot, and an optional clear button.
- `Switch`: accessible toggle (`role="switch"`, `aria-checked`) with smooth thumb animation.
- `Skeleton`: generic skeleton block with subtle shimmer.
Use existing Tailwind tokens (`bg-surface-*`, `border-border`, `text-secondary`, `focus-ring`). Add minimal unit tests for basic rendering + a11y roles.

**Acceptance criteria:**
- Input supports `value`, `onChange`, `placeholder`, `disabled`, `aria-label`.
- Clear button appears only when there is a value, and clears on click.
- Switch toggles with mouse + keyboard (Space/Enter).
- Skeleton blocks match dark UI and don’t flash.

---

## Task 02 — Build a sticky Collections toolbar component
**Prompt:**
Extract the filter UI into a `CollectionsToolbar` component used by `/collections`. Toolbar must include:
- Search input with icon + clear button.
- Sort control as **segmented control** (Updated / Biomarkers / Total).
- Admin-only “Show inactive” as a Switch.
- A small results count text (e.g., “12 templates”).
- “Clear filters” button appears only when search is non-empty or inactive filter is active.
Toolbar should be **sticky** under the global Header with a blurred background and subtle border.

**Acceptance criteria:**
- Sticky behavior works on desktop + mobile without covering content.
- Search is controlled and does not lose focus while typing.
- Segmented control changes sort immediately.
- Clear filters restores defaults.

---

## Task 03 — Introduce a split “Apply” button to reduce action clutter
**Prompt:**
Create an `ApplyTemplateSplitButton` component:
- Primary button: “Apply” (same behavior as current “Add to panel”).
- Dropdown caret opens a menu:
  - “Add to panel” (append)
  - “Replace panel” (replace)
  - Separator
  - “View details” (navigates)
- For admins: add separator + “Edit” and “Delete” entries (reuse existing logic).
Design it to be compact and consistent with existing Button styles.

**Acceptance criteria:**
- Primary click appends.
- Dropdown menu items trigger correct actions.
- Keyboard navigation works (Tab, Enter, Arrow keys inside menu).
- On mobile, it remains usable and does not overflow.

---

## Task 04 — Create a biomarker chips preview component with “Show all”
**Prompt:**
Create `TemplateBiomarkerChips` component:
- Shows first N biomarkers as chips (N=6 desktop, N=4 mobile).
- If more biomarkers exist, show a final chip like “+6 more”.
- Clicking “+X more” expands to show full chip list inline (within the card) and toggles to “Collapse”.
- Maintain `aria-expanded` and proper button semantics.

**Acceptance criteria:**
- No layout shift outside the card; only card height changes.
- Chips wrap nicely and never overflow horizontally.
- Expanded state is preserved per template.

---

## Task 05 — Build a new `TemplateCard` component (single layout for all breakpoints)
**Prompt:**
Create `TemplateCard` used to render a template entry. Structure:
- Left: name, status badge (Unpublished), biomarker count chip, updated (relative with tooltip for exact), description.
- Middle/bottom: biomarker chips preview component.
- Right (desktop) / bottom (mobile): pricing summary + split Apply button.
Use `Card` component, clean spacing, and a grid layout. Keep typography crisp:
- Name: `text-base`/`text-lg` with `font-semibold`
- Meta: `text-xs` muted
- Description: `text-sm` with `line-clamp-2`

**Acceptance criteria:**
- Looks good at ~1280px and ~375px without separate render branches.
- Primary action is visually dominant; secondary actions are in dropdown.
- Unpublished templates are clearly labeled but not screaming red.

---

## Task 06 — Refactor `/collections` to the new card list layout
**Prompt:**
Refactor the collections page to:
- Use `CollectionsToolbar` + a simple list of `TemplateCard` items.
- Remove the desktop table entirely.
- Remove the old “expand row” table behavior.
- Keep existing behaviors: search, sort, admin includeAll, showInactive, pricing, edit/delete modals, toasts, analytics.

**Acceptance criteria:**
- All existing user flows still work: apply template (append), replace panel, view details, admin edit/delete.
- Sorting by total still treats missing prices as “unknown” and pushes them to the end.
- The page code is materially smaller and easier to read.

---

## Task 07 — Upgrade loading state to skeleton cards
**Prompt:**
Replace the “Loading templates” spinner block with 6 skeleton `TemplateCard` placeholders that match final layout (title line, meta line, description lines, price block, action button block).

**Acceptance criteria:**
- No layout jump when data loads.
- Skeletons are used only while template data is loading.

---

## Task 08 — Upgrade empty states (no results vs no templates)
**Prompt:**
Implement two distinct empty states:
- **No results**: when templates exist but filters/search return none. Include a “Clear filters” button.
- **No templates**: when catalog is truly empty. Provide a neutral informational message.
Keep copy i18n-ready.

**Acceptance criteria:**
- Correct empty state appears in each scenario.
- Clear filters button resets state and shows results.

---

## Task 09 — Improve pricing display microcopy and alignment
**Prompt:**
Tweak `TemplatePriceSummary` usage inside the card:
- Add a small label above the amount (e.g., “Current total”) in muted text.
- Ensure numbers align visually (right aligned block, consistent font weight).
- For “not available”, use a neutral label (not red) unless it’s an actual error.

**Acceptance criteria:**
- Price block looks intentional and aligned across cards.
- Loading/error/empty states are visually distinct but not noisy.

---

## Task 10 — Update translations (EN/PL)
**Prompt:**
Add/adjust i18n keys required by the new UI (toolbar labels, results count, clear filters, apply split button labels, show all/collapse biomarkers, empty states). Keep existing keys when possible; only add what’s necessary.

**Acceptance criteria:**
- No missing translation warnings.
- EN and PL both read naturally.

---

## Task 11 — Update tests for the new card layout
**Prompt:**
Update `/collections` tests to stop depending on the table markup. Keep the same behavioral coverage:
- Inactive hidden for non-admin.
- Search filters by name/description.
- Default sort (updated), sort by count, sort by total.
- Updated label shows relative time and tooltip shows exact.
- Biomarker expansion shows all.
- Apply actions append/replace.
- Admin menu edit/delete still works.

**Acceptance criteria:**
- Test suite passes.
- Tests query by roles/labels and stable test ids, not fragile DOM structure.

---

## Task 12 — Visual polish + a11y pass
**Prompt:**
Do a final pass on:
- Hit targets (buttons/menus) >= 36px.
- Focus states are visible everywhere.
- `aria-label`s on icon-only controls.
- Ensure the sticky toolbar doesn’t trap scroll or overlap the header.
- Add subtle hover/active states to cards (no excessive borders).

**Acceptance criteria:**
- Keyboard-only navigation is viable.
- No obvious alignment issues.
- Page feels “quiet” and premium (less clutter, clearer hierarchy).

