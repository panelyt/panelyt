"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

export const DEFAULT_INSTITUTION_ID = 1135;
export const INSTITUTION_STORAGE_KEY = "panelyt:selected-institution";

export interface InstitutionSelection {
  id: number;
  label: string | null;
}

interface InstitutionStoreState {
  institutionId: number;
  label: string | null;
  setInstitution: (selection: InstitutionSelection) => void;
}

const isValidInstitutionId = (value: unknown): value is number => {
  return Number.isInteger(value) && (value as number) > 0;
};

const normalizeLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseInstitutionState = (
  value: unknown,
): Pick<InstitutionStoreState, "institutionId" | "label"> => {
  if (!value) {
    return { institutionId: DEFAULT_INSTITUTION_ID, label: null };
  }

  if (isValidInstitutionId(value)) {
    return { institutionId: value, label: null };
  }

  if (typeof value !== "object") {
    return { institutionId: DEFAULT_INSTITUTION_ID, label: null };
  }

  const candidate = value as {
    institutionId?: unknown;
    id?: unknown;
    label?: unknown;
  };

  const institutionId = isValidInstitutionId(candidate.institutionId)
    ? candidate.institutionId
    : isValidInstitutionId(candidate.id)
      ? candidate.id
      : DEFAULT_INSTITUTION_ID;

  return {
    institutionId,
    label: normalizeLabel(candidate.label),
  };
};

const createInstitutionStorage = (): PersistStorage<
  Pick<InstitutionStoreState, "institutionId" | "label">
> | undefined => {
  if (typeof window === "undefined") return undefined;

  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(name);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;

        if (parsed && typeof parsed === "object" && "state" in parsed) {
          const parsedState = (parsed as { state?: unknown }).state;
          return {
            state: parseInstitutionState(parsedState),
            version: typeof (parsed as { version?: unknown }).version === "number"
              ? (parsed as { version?: number }).version
              : undefined,
          };
        }

        return { state: parseInstitutionState(parsed) };
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch {
        // Ignore storage errors
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignore storage errors
      }
    },
  };
};

export const useInstitutionStore = create<InstitutionStoreState>()(
  persist(
    (set) => ({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
      setInstitution: (selection) => {
        if (!isValidInstitutionId(selection.id)) return;
        set({
          institutionId: selection.id,
          label: normalizeLabel(selection.label),
        });
      },
    }),
    {
      name: INSTITUTION_STORAGE_KEY,
      storage: createInstitutionStorage(),
      partialize: (state) => ({
        institutionId: state.institutionId,
        label: state.label,
      }),
    },
  ),
);

export type { InstitutionStoreState };
