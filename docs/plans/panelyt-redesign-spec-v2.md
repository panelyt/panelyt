# Panelyt UX + Visual Redesign Spec

Status: **Implementation-ready**
Last updated: 2026-01-05  
Scope: Full web app UX + visual redesign (desktop-first, responsive)

---

## 0. What this spec is

This is the **opinionated** redesign spec that keeps the intent of v1 (faster panel building + clearer optimization outcomes) while aligning with how the app actually works today in code:

- Next.js app with pages: Optimizer (/), Templates (/collections), Lists (/lists), Account (/account), Privacy (/privacy)
- Core solver endpoints: `/optimize`, `/optimize/addons`
- Saved lists support: create/update/delete/share + notifications toggle (per list and bulk)
- Templates support: browse + detail, admin create/edit/delete, share links
- URL share: `?biomarkers=...` plus `?template=...`, `?shared=...`, `?list=...`
- i18n is required (`next-intl`); translation keys must be used for all UI strings

---

## 1. Product goal and success criteria

### 1.1 Primary goal
**Minimize time-to-optimal-route after selection.**

### 1.2 Secondary goals
- Reduce steps between “I know what I want to measure” → “I know what to buy where”.
- Make the “why” behind the route obvious (packages, overlaps, bonus biomarkers, uncovered gaps).
- Make save/share/alerts management feel fast and reliable.

### 1.3 Success metrics (instrumentation requirements)
Track at minimum:
1. **TTOR (Time to Optimal Route)**  
   - Start: first biomarker added to empty panel (or panel loaded)
   - End: user sees a computed “Best price” route (solver result rendered)
2. Panel building friction:
   - avg biomarkers added per session
   - % sessions using paste/multi-add
   - % sessions using templates
3. Save/share activation:
   - save list conversion rate
   - share link copy success rate
4. Alerts adoption:
   - % users linking Telegram
   - % saved lists with alerts enabled

> Implementation note: the app already loads an analytics script in production. Add explicit events for these interactions (see §12).

---

## 2. Non-negotiable constraints (must comply)

- **Do not remove** any existing information or functionality. Reorganize, re-label, and add.
- **i18n required**: no hard-coded copy (including loading text, aria-labels, empty states).
- **Desktop-first** but responsive. Must work on laptop widths (≥ 1280px) and down to mobile.
- Accessibility: WCAG 2.1 AA for contrast, keyboard, focus, dialogs, and menus.
- Keep the “clean, modern, subtle terminal cues” aesthetic.

---

## 3. IA and navigation

### 3.1 Top-level sections
- **Optimizer** (Home): build + optimize
- **Templates**: curated biomarker sets
- **Lists**: saved panels + sharing + alerts
- **Account**: auth + Telegram + settings
- **Privacy**: styled static content

### 3.2 Global invariants
1. **Optimizer is always one click away**
2. **Current panel summary is available on all main screens** (Optimizer/Templates/Lists/Account)

### 3.3 Navigation behavior
- Header stays sticky and compact.
- Primary nav is text-based (Optimizer / Templates / Lists).
- Account avatar/name opens a small menu (Account, Sign out) or Sign in button if logged out.
- Language switch remains in header.

---

## 4. Global layout system

### 4.1 App shell
All screens use:
- Sticky header
- Page body (max width 1280–1440px)
- Footer

### 4.2 Responsive breakpoints (design targets)
- **XL**: ≥ 1280px (two-rail layouts fully enabled)
- **LG**: 1024–1279px (two-rail may stack, but summary stays sticky)
- **MD**: 768–1023px (stacked layout; sticky bar moves to bottom)
- **SM**: < 768px (stacked + simplified tables to cards)

### 4.3 “Panel Tray” (global panel summary)
A persistent UI element that exposes the *current panel* outside the Optimizer.

**Placement**
- Desktop: right side of header (compact pill) → opens a slide-over tray
- Mobile: bottom sticky bar → opens full-screen sheet

**Collapsed pill shows**
- Biomarker count
- Best price total (if cached) or “Run optimize” prompt
- Status icon:
  - ✅ fully covered
  - ⚠ gaps exist (uncovered biomarkers)
  - ⏳ computing

**Expanded tray shows**
- Selected biomarkers list (chips, removable)
- Quick actions: Open Optimizer, Share link, Save list
- If optimization cached: best price chip + total + savings vs floor

**Data source**
- Panel selection is persisted (currently sessionStorage). Redesign requires a single global store (recommended: Zustand persist to sessionStorage).
- Optimization summary can be pulled from React Query cache (latest result) or computed lazily.

Acceptance criteria:
- Panel tray appears on Templates, Lists, Account without requiring the user to navigate home.
- Removing a biomarker from tray updates the stored selection and (if on Optimizer) updates results.

---

## 5. Visual system (tokens + style rules)

### 5.1 Typography
Use **one UI font + one mono font** (already supported via `next/font`).

Recommended (low-risk, already in repo):
- UI: **Geist Sans**
- Data: **Geist Mono**

Token rules:
- Mono for:
  - biomarker codes
  - currency / numeric deltas
  - “metadata rows” (e.g., `DIAG | 12 items | updated 2h ago`)
- Sans for:
  - titles, labels, body copy

### 5.2 Color
Theme is dark-first (still supports light surfaces in specific cards if needed, but default is dark).

Core tokens (conceptual):
- `bg.app`: deep slate/near-black
- `bg.surface.1`: primary card
- `bg.surface.2`: elevated card / hover
- `border.default`: subtle slate border
- `text.primary`: near-white
- `text.secondary`: slate-300/400
- Accents:
  - `accent.cyan` (primary actions)
  - `accent.emerald` (success / best route / savings)
  - `accent.amber` (warnings / gaps / overlaps)
  - `accent.red` (errors / destructive)

### 5.3 Terminal cues (moderate)
- Subtle grid texture in the app background (very low contrast).
- Metadata lines can use `|` separators and mono type.
- Chips should feel “CLI-like” (tight, rounded-full, mono code secondary line optional).

### 5.4 Elevation + borders
- Use borders more than shadows.
- Shadows only for:
  - modal surfaces
  - active/selected result emphasis

### 5.5 Motion
- 100–200ms transitions, low-amplitude.
- “Result update highlight”: brief border glow or background pulse on updated totals.
- Respect `prefers-reduced-motion`.

### 5.6 Components style rules
- Buttons: primary (gradient or cyan solid), secondary (neutral outline), destructive (red outline).
- Cards: layered dark surfaces, consistent padding/radius.
- Tables: compact, strong row separators, sticky header on desktop when scrolling.

---

## 6. Core interaction patterns

### 6.1 Notifications (toasts)
Standardize feedback:
- Success (saved, copied, applied addon)
- Error (network, auth)
- Info (no-op: addon already selected)

Recommended dependency: `sonner` or Radix Toast (for accessibility).

### 6.2 Keyboard support (power-user)
Must support:
- `/` focuses the search field (Optimizer and Panel Tray)
- `Enter` adds highlighted suggestion
- `Esc` closes menus/modals
- Arrow keys navigate suggestion list
- `Cmd/Ctrl + K` opens a Command Palette (optional but recommended)

Recommended dependency: `cmdk`.

### 6.3 “No hard-coded copy”
All visible strings, aria labels, and loading placeholders must come from `next-intl` messages.

---

## 7. Screen specs

## 7.1 Optimizer (Home)

### 7.1.1 Primary job
Fastest path from selecting biomarkers to seeing the best price route + what to buy.

### 7.1.2 Layout (desktop)
Two-rail layout:

- **Left rail (40%)**: input + selection + actions  
  1) Search/typeahead  
  2) Selected biomarkers  
  3) Helper text (“We optimize Diagnostyka prices”)  
  4) Quick actions row (Save / Share / Load / Templates)  
  5) Optional “recent panels” (future)

- **Right rail (60%)**: results  
  1) Results summary  
  2) Add-on suggestions (collapsible)  
  3) Coverage gaps (new)  
  4) Price breakdown (packages + singles)

### 7.1.3 Sticky summary bar
Always visible when selection is non-empty:
- Best price chip + total now
- Savings vs 30-day floor
- Coverage indicator (100% or “missing N”)
- Quick actions: Share, Save

Desktop placement: top of the right rail (sticky within results column).  
Mobile placement: bottom sticky bar.

### 7.1.4 Search/typeahead
**Must keep:** current behavior (suggest biomarkers and templates, show prices).

Redesign improvements:
- Suggestions are grouped:
  - Biomarkers group
  - Templates group (with description + biomarker count)
- Add “Paste list” affordance:
  - Accept comma/newline-separated codes
  - Confirm addition count and handle duplicates gracefully

Acceptance criteria:
- Adding a biomarker never clears selection except when user explicitly chooses “Replace panel”.
- Template selection defaults to **Append** (keep current behavior), but UI must expose:
  - **Append to panel**
  - **Replace panel** (confirmation)

### 7.1.5 Selected biomarkers component
Redesign:
- Chips show:
  - primary: display name
  - secondary (optional): code in mono (on hover or in tray view)
- Provide:
  - Clear all (destructive, requires confirmation when > 0)
  - Undo last remove (optional; could be cmd+z if feasible)

### 7.1.6 Results summary (“Best price”)
Use a compact summary header with:
- Total now (prominent)
- Savings vs 30-day floor
- Bonus count/value

### 7.1.7 Add-on suggestions (“Add more for less”)
Position: after results summary.

Collapsed: single-line summary  
Expanded: list of upgrade packages, each shows:
- Package name
- Biomarkers added (chips)
- Upgrade cost (+PLN)
- Optional: show “value” (sum of added biomarker now prices) if available

Action: “Apply” adds biomarkers to selection (append-only).  
Must show a toast/notice.

### 7.1.8 Coverage gaps (NEW component)
When active optimization result has `uncovered.length > 0`, show a dedicated card:

Card content:
- Title: “Coverage gaps”
- Summary: “N biomarkers cannot be covered by this basket”
- List of uncovered biomarkers:
  - display name (if known)
  - code in mono
  - actions:
    - remove from selection
    - search alternatives (focus search with code prefilled)

Coverage gaps should reflect the **current basket**.

### 7.1.9 Price breakdown (“Your order”)
Always visible; grouped into:
- Packages
- Single tests

Per item:
- Title + external link
- Biomarkers included:
  - selected biomarkers (neutral chip)
  - bonus biomarkers (emerald chip + sparkles icon)
- Overlap note: “X also in Y”
- Price now + 30-day floor + micro bar

Footer:
- Total now
- Savings vs floor (if any)

### 7.1.10 Error/notice handling
- Errors never clear selection.
- Notices (applied addon / added template) auto-dismiss after ~4s (already exists).
- Error banner must remain visible until dismissed or corrected.

---

## 7.2 Templates (/collections)

### 7.2.1 Primary job
Find reusable sets quickly and apply them to current panel.

### 7.2.2 Layout
Default view is compact list (dense cards) with:
- Template name
- Description (1–2 lines)
- Biomarker count
- “Current total” (computed via solver in auto mode, cached)
- Updated timestamp
- Primary action: “Add to panel”
- Secondary: “View details”
- Admin actions: edit/delete in an overflow menu

Filters/sort (must be implementable with current data):
- Search by name/description
- Sort by:
  - updated
  - biomarker count
  - current total (auto)
- Filter:
  - Active only (default on)
  - Show inactive (admin only)

### 7.2.3 Inline expansion
Each row can expand to show biomarker list (chips):
- display name
- code in mono (secondary)

### 7.2.4 Template details
Detail view uses split layout:
- left: biomarker list + “Add/Replace panel”
- right: optimization results for template (reuse same results components)

---

## 7.3 Lists (/lists)

### 7.3.1 Primary job
Manage saved panels and alerts efficiently.

### 7.3.2 Layout (desktop)
Use a dense table with columns:
- Name
- Biomarkers count
- Total (last known, PLN)
- Updated (relative + tooltip with exact timestamp)
- Alerts (toggle)
- Share (copy link + status)
- Actions (view, delete)

Top area:
- Summary metrics:
  - # lists
  - # alerts enabled
- Bulk actions:
  - Toggle all alerts (already supported)
  - Optional: Refresh totals (requires new endpoint; see §11)

Row actions:
- Copy share link (regenerate optional)
- Open shared link
- Delete (confirm)
- “Open in Optimizer” (loads list to panel)

### 7.3.3 Mobile layout
Table collapses to cards:
- Name + total
- alerts toggle
- share button
- actions in overflow

---

## 7.4 Account (/account)

Primary job: make status + next actions obvious.

Layout:
1) Telegram status card (prominent)
2) Connection instructions (progressive disclosure)
3) Profile/auth section
4) Optional: notification preferences (future)

Must keep:
- “Connect Telegram” flow with bot link, token display, and “refresh status”.
- Clear “connected” vs “not connected” visual.

---

## 7.5 Privacy (/privacy)

No structural changes; apply typography + spacing system:
- readable line length
- consistent headings
- link styling consistent with theme

---

## 8. Accessibility requirements

- Keyboard reachable everything (menus, dialogs, tabs, toggles).
- Focus ring is always visible and meets contrast.
- Dialogs:
  - focus trap
  - Esc closes
  - background inert
- Tooltips must be accessible:
  - appear on focus and hover
  - not required to complete primary tasks
- Color contrast meets WCAG 2.1 AA.

Recommended dependency: Radix UI primitives (Dialog, DropdownMenu, Tooltip, Tabs, Popover).

---

## 9. Internationalization requirements (implementation rules)

- All UI copy must come from `next-intl` messages:
  - button labels
  - empty states
  - loading states
  - aria-labels
  - errors that are not server-provided
- Currency formatting uses `Intl.NumberFormat` with locale:
  - PLN default but formatted per locale rules
- Dates:
  - show relative time in UI (“2h ago”)
  - show exact time in tooltip (localized)

---

## 10. Engineering guidance (how to implement safely)

### 10.1 Component architecture (recommended)
Create a small design system layer:
- `ui/Button`
- `ui/Card`
- `ui/Chip`
- `ui/Table`
- `ui/Dialog`
- `ui/Popover`
- `ui/Tooltip`
- `ui/Toast`
- `ui/SegmentedControl`

Use `class-variance-authority` (CVA) + `tailwind-merge` for variants.

### 10.2 State management
Adopt a single “panel selection store”:
- recommended: Zustand + persist to sessionStorage
- provides:
  - selected biomarkers
  - actions (add/remove/clear/replace/appendTemplate/applyAddon)
  - last optimization summary (optional cache pointer)

### 10.3 Data fetching
Keep React Query (`@tanstack/react-query`):
- Use `/optimize` for main results.
- Use `/optimize/addons` lazily after selecting current items.
- Ensure debouncing stays (~300–500ms) to avoid spam.

### 10.4 Replace custom popovers/modals with accessible primitives
- Replace “LoadMenu” click-outside logic with Radix DropdownMenu.
- Replace current modal overlays with Radix Dialog for focus management.

---

## 11. Backend changes (optional but recommended)

These are not required for visual redesign, but unlock key UX improvements:

1) **Refresh totals** endpoint for lists  
   - `POST /lists/{id}/refresh` (recompute last_known_total_grosz + timestamp)
   - Optional: `POST /lists/refresh` for bulk refresh

2) **Template metadata** (future)
   - popularity field or usage count to enable “popular” sorting

---

## 12. Analytics events (minimum set)

Emit client events:
- `panel_add_biomarker`
- `panel_remove_biomarker`
- `panel_apply_template` (append vs replace)
- `panel_apply_addon`
- `optimize_result_rendered` (include: total, uncoveredCount)
- `share_copy_url` (success/failure)
- `save_list_submit` (success/failure)
- `alerts_toggle` (single/bulk)
- `telegram_link_opened`

---

## 13. Rollout plan (reduce regressions)

Phase 1: Optimizer only  
- two-rail layout + sticky summary + coverage gaps + accessibility primitives

Phase 2: Lists  
- table redesign + bulk actions + panel tray integration

Phase 3: Templates + Account + Privacy  
- list redesign + apply-to-panel actions + admin ergonomics

---

## Appendix A: URL parameters (must remain supported)

- `?biomarkers=CODE1,CODE2,...` (share panel selection)
- `?template=slug` (load template into panel)
- `?shared=token` (load shared list into panel)
- `?list=id` (load user saved list into panel)

---

## Appendix B: Glossary

- **Biomarker**: requested measurement (code + display name)
- **Package**: bundle that covers multiple biomarkers
- **Single test**: an individual test
- **Bonus biomarkers**: included by chosen packages beyond what user selected
- **30-day floor**: minimum total price over last 30 days
- **Route**: basket of packages/singles to cover selection
