# UX Redesign: Price-Focused Optimization Results

## Problem

Current UX issues:
- **Optimization Summary** serves dual purposes (info display + lab selector) — confusing and space-heavy
- **Price breakdown** is most important info but sits at the bottom
- **Page header/hero** takes too much space without providing proportional value
- Mixed audience (savvy biohackers + newcomers) needs progressive disclosure

## Design Principles

1. **Price as hero** — total per lab, front and center
2. **Quick lab comparison** — tabs with price + savings + bonus visible at a glance
3. **Minimal chrome** — no hero section, instructive text distributed throughout
4. **Progressive disclosure** — hints for newcomers, no mandatory reading
5. **Each text element teaches one thing** — non-repetitive, cohesive narrative

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ PANELYT    Optimizer  Templates  My Lists    Sign in   │  ← unchanged
├─────────────────────────────────────────────────────────┤
│                                                         │
│  BUILD YOUR TEST PANEL                                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Search biomarkers to add...                       │ │
│  └───────────────────────────────────────────────────┘ │
│  [Glucose ×] [TSH ×] [Vitamin D ×]                     │
│  We compare prices across labs                          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  BEST PRICES                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │ Ulta    ✓  │ │ Quest      │ │ LabCorp    │          │
│  │ $89        │ │ $102       │ │ unavailable│          │
│  │ ↓$34 saved │ │ ↓$21 saved │ │ ⚠ missing 2│          │
│  │ +2 bonus   │ │ +1 bonus   │ │            │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ ▸ ADD MORE FOR LESS — 3 biomarkers for +$12            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  YOUR ORDER FROM ULTA                         4 items  │
│  ───────────────────────────────────────────────────── │
│  PACKAGES                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Comprehensive Metabolic Panel           $45  ↗  │   │
│  │ ✓ Glucose  ✓ BUN  ✓ Creatinine  +3 bonus       │   │
│  │ ▀▀▀▀▀▀▀▀▀▀▀░░░░ $45 / $52 floor                │   │
│  └─────────────────────────────────────────────────┘   │
│  ...                                                    │
│  ───────────────────────────────────────────────────── │
│  TOTAL                                      $89        │
│  You're saving $34 vs. 30-day floor                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Component Changes

### 1. Hero Section — REMOVE

Eliminate entirely. Replace with instructive text distributed throughout existing elements.

### 2. Build Panel — UPDATE TEXT

| Element | Current | New |
|---------|---------|-----|
| Section title | "Build your biomarker set" | "Build your test panel" |
| Search placeholder | "Search biomarkers" | "Search biomarkers to add..." |
| Helper text | (none) | "We compare prices across labs" |

### 3. Lab Tabs — NEW COMPONENT (replaces summary section)

Promoted to hero position. Each tab shows:
- Lab name
- Total price (prominent)
- Savings vs. 30-day floor
- Bonus biomarkers count
- Active state indicator

**Unavailable labs:** Show "unavailable" + "missing X" with tooltip explaining which biomarkers are exclusive to other labs.

### 4. Stats Grid — REMOVE

Info now integrated into lab tabs (price, savings, bonus per lab).

### 5. Exclusive/Overlap Sections — RELOCATE

**Exclusive:** Contextual warning on lab tabs when a lab can't cover all biomarkers.

**Overlap:** Inline note in breakdown: "Vitamin D also in Comprehensive (no extra cost)"

### 6. Addon Suggestions — MOVE + REDESIGN

**Position:** After lab tabs, before breakdown.

**Collapsed state:**
```
▸ ADD MORE FOR LESS — 3 biomarkers for +$12
```

**Expanded state:** List of addons, each showing:
- Biomarker name
- Why suggested (included in package / commonly tested / cheap to add)
- Price impact (+$0, +$8, etc.)
- Add button

### 7. Price Breakdown — UPDATE

**Title:** "Your order from [Lab]" (dynamic based on selected lab)

**Always visible** (not collapsible).

**Per item:**
- Name + external link
- Biomarkers covered (✓ selected, +X bonus)
- Price bar (current vs. 30-day floor)
- Overlap note if relevant

**Footer:**
- Total price
- Savings summary

## Instructive Text Strategy

Each element teaches one thing; together they tell the story:

| Element | Text | Teaches |
|---------|------|---------|
| Section title | "Build your test panel" | What you're doing |
| Search placeholder | "Search biomarkers to add..." | How to start |
| Helper text | "We compare prices across labs" | What the tool does |
| Results title | "Best prices" | This is your answer |
| Lab tabs | "$89 ↓$34 +2 bonus" | Price, savings, extras |
| Addons title | "Add more for less" | There's an opportunity |
| Breakdown title | "Your order from Ulta" | What you'll buy |

## Migration Notes

### Files to modify:
- `apps/web/src/app/page.tsx` — remove hero section
- `apps/web/src/components/build-panel.tsx` — update text
- `apps/web/src/components/optimization-results/summary-section.tsx` — replace with lab tabs
- `apps/web/src/components/optimization-results/price-breakdown.tsx` — update title, always visible
- `apps/web/src/components/addon-suggestions-panel.tsx` — move position, add collapsed state

### Components to remove:
- Hero section
- Stats grid (SummaryStatsGrid)
- Exclusive section (as standalone)
- Overlap section (as standalone)

### Components to create:
- Lab tabs component (compact tab design with price/savings/bonus)
