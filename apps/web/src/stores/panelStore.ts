"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

import { markTtorStart, resetTtorStart, track } from "../lib/analytics";

export const PANEL_STORAGE_KEY = "panelyt:selected-biomarkers";

export interface PanelBiomarker {
  code: string;
  name: string;
}

export interface OptimizationSummary {
  key: string;
  totalNow: number;
  totalMin30: number;
  uncoveredCount: number;
  updatedAt: string;
}

interface LastRemovedSnapshot {
  biomarker: PanelBiomarker;
  removedAt: number;
  index: number;
}

interface PanelStoreState {
  selected: PanelBiomarker[];
  lastOptimizationSummary?: OptimizationSummary;
  lastRemoved?: LastRemovedSnapshot;
  setOptimizationSummary: (summary: OptimizationSummary) => void;
  addOne: (biomarker: PanelBiomarker) => void;
  addMany: (biomarkers: PanelBiomarker[]) => void;
  remove: (code: string) => void;
  clearAll: () => void;
  replaceAll: (biomarkers: PanelBiomarker[]) => void;
  restoreBiomarker: (biomarker: PanelBiomarker, index?: number) => void;
  undoLastRemoved: () => void;
}

const isValidBiomarker = (value: unknown): value is PanelBiomarker => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { code?: unknown; name?: unknown };
  return typeof candidate.code === "string" && typeof candidate.name === "string";
};

const sanitizeSelection = (value: unknown): PanelBiomarker[] => {
  if (!Array.isArray(value)) return [];
  const result: PanelBiomarker[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isValidBiomarker(entry)) continue;
    const code = entry.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ code, name: entry.name });
  }
  return result;
};

const isValidSummary = (value: unknown): value is OptimizationSummary => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.key === "string" &&
    typeof candidate.totalNow === "number" &&
    typeof candidate.totalMin30 === "number" &&
    typeof candidate.uncoveredCount === "number" &&
    typeof candidate.updatedAt === "string"
  );
};

const createPanelStorage = (): PersistStorage<
  Pick<PanelStoreState, "selected" | "lastOptimizationSummary">
> | undefined => {
  if (typeof window === "undefined") return undefined;

  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(name);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;

        if (Array.isArray(parsed)) {
          return {
            state: { selected: sanitizeSelection(parsed), lastOptimizationSummary: undefined },
          };
        }

        if (parsed && typeof parsed === "object" && "state" in parsed) {
          const parsedState = (parsed as { state?: unknown }).state as Record<string, unknown>;
          return {
            state: {
              selected: sanitizeSelection(parsedState?.selected),
              lastOptimizationSummary: isValidSummary(parsedState?.lastOptimizationSummary)
                ? parsedState.lastOptimizationSummary
                : undefined,
            },
            version: typeof (parsed as { version?: unknown }).version === "number"
              ? (parsed as { version?: number }).version
              : undefined,
          };
        }
      } catch {
        return null;
      }

      return null;
    },
    setItem: (name, value) => {
      try {
        sessionStorage.setItem(name, JSON.stringify(value));
      } catch {
        // Ignore storage errors
      }
    },
    removeItem: (name) => {
      try {
        sessionStorage.removeItem(name);
      } catch {
        // Ignore storage errors
      }
    },
  };
};

const dedupeSelection = (biomarkers: PanelBiomarker[]): PanelBiomarker[] => {
  const result: PanelBiomarker[] = [];
  const seen = new Set<string>();
  for (const entry of biomarkers) {
    const code = entry.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ code, name: entry.name });
  }
  return result;
};

const insertBiomarkerAt = (
  biomarkers: PanelBiomarker[],
  biomarker: PanelBiomarker,
  index: number,
): PanelBiomarker[] => {
  if (biomarkers.some((item) => item.code === biomarker.code)) {
    return biomarkers;
  }
  const clampedIndex = Math.max(0, Math.min(index, biomarkers.length));
  const next = biomarkers.slice();
  next.splice(clampedIndex, 0, biomarker);
  return next;
};

let lastRemovedTimeout: ReturnType<typeof setTimeout> | undefined;

const scheduleLastRemovedClear = (set: (partial: Partial<PanelStoreState>) => void) => {
  if (lastRemovedTimeout) {
    clearTimeout(lastRemovedTimeout);
  }
  lastRemovedTimeout = setTimeout(() => {
    set({ lastRemoved: undefined });
  }, 10_000);
};

export const usePanelStore = create<PanelStoreState>()(
  persist(
    (set) => ({
      selected: [],
      lastOptimizationSummary: undefined,
      lastRemoved: undefined,
      setOptimizationSummary: (summary) => {
        set({ lastOptimizationSummary: summary });
      },
      addOne: (biomarker) => {
        const code = biomarker.code.trim();
        if (!code) return;
        let didAdd = false;
        let wasEmpty = false;
        set((state) => {
          if (state.selected.some((item) => item.code === code)) {
            return state;
          }
          wasEmpty = state.selected.length === 0;
          didAdd = true;
          return {
            selected: [...state.selected, { code, name: biomarker.name }],
            lastOptimizationSummary: undefined,
          };
        });
        if (didAdd) {
          track("panel_add_biomarker", { count: 1 });
          if (wasEmpty) {
            markTtorStart();
          }
        }
      },
      addMany: (biomarkers) => {
        let addedCount = 0;
        let wasEmpty = false;
        set((state) => {
          if (biomarkers.length === 0) return state;
          wasEmpty = state.selected.length === 0;
          const existing = new Set(state.selected.map((item) => item.code));
          const additions: PanelBiomarker[] = [];
          for (const entry of biomarkers) {
            const code = entry.code.trim();
            if (!code || existing.has(code)) continue;
            existing.add(code);
            additions.push({ code, name: entry.name });
          }
          if (additions.length === 0) return state;
          addedCount = additions.length;
          return {
            selected: [...state.selected, ...additions],
            lastOptimizationSummary: undefined,
          };
        });
        if (addedCount > 0) {
          track("panel_add_biomarker", { count: addedCount });
          if (wasEmpty) {
            markTtorStart();
          }
        }
      },
      remove: (code) =>
        {
          let removed: PanelBiomarker | undefined;
          let didEmpty = false;
          set((state) => {
            const removedIndex = state.selected.findIndex((item) => item.code === code);
            if (removedIndex === -1) {
              return state;
            }
            removed = state.selected[removedIndex];
            const nextSelected = state.selected.filter((item) => item.code !== code);
            didEmpty = nextSelected.length === 0;
            return {
              selected: nextSelected,
              lastOptimizationSummary: undefined,
              lastRemoved: { biomarker: removed, removedAt: Date.now(), index: removedIndex },
            };
          });
          if (removed) {
            scheduleLastRemovedClear(set);
            track("panel_remove_biomarker", { count: 1 });
            if (didEmpty) {
              resetTtorStart();
            }
          }
        },
      clearAll: () => {
        if (lastRemovedTimeout) {
          clearTimeout(lastRemovedTimeout);
        }
        let hadSelection = false;
        set((state) => {
          hadSelection = state.selected.length > 0;
          return { selected: [], lastOptimizationSummary: undefined, lastRemoved: undefined };
        });
        if (hadSelection) {
          resetTtorStart();
        }
      },
      replaceAll: (biomarkers) => {
        let shouldMark = false;
        let shouldReset = false;
        set((state) => {
          const next = dedupeSelection(biomarkers);
          shouldMark = state.selected.length === 0 && next.length > 0;
          shouldReset = state.selected.length > 0 && next.length === 0;
          return { selected: next, lastOptimizationSummary: undefined };
        });
        if (shouldMark) {
          markTtorStart();
        }
        if (shouldReset) {
          resetTtorStart();
        }
      },
      restoreBiomarker: (biomarker, index) => {
        const code = biomarker.code.trim();
        if (!code) return;
        let shouldMark = false;
        set((state) => {
          const alreadySelected = state.selected.some((item) => item.code === code);
          if (alreadySelected) {
            return state;
          }
          shouldMark = state.selected.length === 0;
          const insertionIndex = typeof index === "number" ? index : state.selected.length;
          return {
            selected: insertBiomarkerAt(state.selected, { code, name: biomarker.name }, insertionIndex),
            lastOptimizationSummary: undefined,
          };
        });
        if (shouldMark) {
          markTtorStart();
        }
      },
      undoLastRemoved: () => {
        if (lastRemovedTimeout) {
          clearTimeout(lastRemovedTimeout);
        }
        let shouldMark = false;
        set((state) => {
          if (!state.lastRemoved) {
            return state;
          }
          const { biomarker, index } = state.lastRemoved;
          const alreadySelected = state.selected.some((item) => item.code === biomarker.code);
          if (alreadySelected) {
            return { lastRemoved: undefined };
          }
          shouldMark = state.selected.length === 0;
          const nextSelected = insertBiomarkerAt(state.selected, biomarker, index);
          return {
            selected: nextSelected,
            lastOptimizationSummary: undefined,
            lastRemoved: undefined,
          };
        });
        if (shouldMark) {
          markTtorStart();
        }
      },
    }),
    {
      name: PANEL_STORAGE_KEY,
      storage: createPanelStorage(),
      partialize: (state) => ({
        selected: state.selected,
        lastOptimizationSummary: state.lastOptimizationSummary,
      }),
    },
  ),
);
