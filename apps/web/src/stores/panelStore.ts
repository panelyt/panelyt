"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

export const PANEL_STORAGE_KEY = "panelyt:selected-biomarkers";

export interface PanelBiomarker {
  code: string;
  name: string;
}

export interface OptimizationSummary {
  labCode: string;
  totalNow: number;
  totalMin30: number;
  uncoveredCount: number;
  updatedAt: string;
}

interface PanelStoreState {
  selected: PanelBiomarker[];
  lastOptimizationSummary?: OptimizationSummary;
  addOne: (biomarker: PanelBiomarker) => void;
  addMany: (biomarkers: PanelBiomarker[]) => void;
  remove: (code: string) => void;
  clearAll: () => void;
  replaceAll: (biomarkers: PanelBiomarker[]) => void;
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
    typeof candidate.labCode === "string" &&
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
      const raw = sessionStorage.getItem(name);
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

export const usePanelStore = create<PanelStoreState>()(
  persist(
    (set) => ({
      selected: [],
      lastOptimizationSummary: undefined,
      addOne: (biomarker) => {
        const code = biomarker.code.trim();
        if (!code) return;
        set((state) => {
          if (state.selected.some((item) => item.code === code)) {
            return state;
          }
          return {
            selected: [...state.selected, { code, name: biomarker.name }],
          };
        });
      },
      addMany: (biomarkers) => {
        set((state) => {
          if (biomarkers.length === 0) return state;
          const existing = new Set(state.selected.map((item) => item.code));
          const additions: PanelBiomarker[] = [];
          for (const entry of biomarkers) {
            const code = entry.code.trim();
            if (!code || existing.has(code)) continue;
            existing.add(code);
            additions.push({ code, name: entry.name });
          }
          if (additions.length === 0) return state;
          return { selected: [...state.selected, ...additions] };
        });
      },
      remove: (code) =>
        set((state) => ({
          selected: state.selected.filter((item) => item.code !== code),
        })),
      clearAll: () => set({ selected: [] }),
      replaceAll: (biomarkers) =>
        set({
          selected: dedupeSelection(biomarkers),
        }),
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
