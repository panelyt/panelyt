"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BiomarkerListTemplateSchema,
  type SavedList,
} from "@panelyt/types";
import { useTranslations } from "next-intl";

import { getJson, extractErrorMessage } from "../lib/http";

const STORAGE_KEY = "panelyt:selected-biomarkers";

function loadFromStorage(): SelectedBiomarker[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    // Validate structure
    return parsed.filter(
      (item): item is SelectedBiomarker =>
        typeof item === "object" &&
        item !== null &&
        typeof item.code === "string" &&
        typeof item.name === "string"
    );
  } catch {
    return [];
  }
}

function saveToStorage(biomarkers: SelectedBiomarker[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(biomarkers));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

export interface SelectedBiomarker {
  code: string;
  name: string;
}

export interface SelectionNotice {
  tone: "success" | "info";
  message: string;
}

export interface UseBiomarkerSelectionOptions {
  /** Called when selection changes significantly (template load, addon apply, list load) */
  onSelectionChange?: () => void;
}

export interface UseBiomarkerSelectionResult {
  selected: SelectedBiomarker[];
  /** Biomarker codes only (derived from selected) */
  biomarkerCodes: string[];
  /** Payload for API calls: { code, name }[] */
  selectionPayload: { code: string; name: string }[];
  notice: SelectionNotice | null;
  error: string | null;
  handleSelect: (biomarker: SelectedBiomarker) => void;
  handleRemove: (code: string) => void;
  handleTemplateSelect: (selection: { slug: string; name: string }) => Promise<void>;
  handleApplyAddon: (
    biomarkers: { code: string; name: string }[],
    packageName: string,
  ) => void;
  handleLoadList: (list: SavedList) => void;
  setSelected: React.Dispatch<React.SetStateAction<SelectedBiomarker[]>>;
  setError: (error: string | null) => void;
  setNotice: (notice: SelectionNotice | null) => void;
  clearError: () => void;
  clearNotice: () => void;
}

export function useBiomarkerSelection(
  options: UseBiomarkerSelectionOptions = {},
): UseBiomarkerSelectionResult {
  const t = useTranslations();
  const { onSelectionChange } = options;

  const [selected, setSelected] = useState<SelectedBiomarker[]>(loadFromStorage);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SelectionNotice | null>(null);

  // Track if this is the initial mount to avoid saving on hydration
  const isInitialMount = useRef(true);

  // Persist selection to sessionStorage whenever it changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveToStorage(selected);
  }, [selected]);

  // Derived values
  const biomarkerCodes = selected.map((b) => b.code);
  const selectionPayload = selected.map((item) => ({ code: item.code, name: item.name }));

  // Auto-dismiss notice after 4 seconds
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleSelect = useCallback((biomarker: SelectedBiomarker) => {
    setSelected((current) => {
      const normalized = biomarker.code.trim();
      if (!normalized) return current;
      if (current.some((b) => b.code === normalized)) return current;
      return [...current, { code: normalized, name: biomarker.name }];
    });
    setError(null);
    setNotice(null);
  }, []);

  const handleRemove = useCallback((code: string) => {
    setSelected((current) => current.filter((item) => item.code !== code));
  }, []);

  const handleTemplateSelect = useCallback(
    async (selection: { slug: string; name: string }) => {
      const { slug } = selection;
      try {
        const payload = await getJson(`/biomarker-lists/templates/${slug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);

        setSelected((current) => {
          const existing = new Set(current.map((item) => item.code));
          const additions = template.biomarkers.filter((entry) => !existing.has(entry.code));

          const resultNotice: SelectionNotice = additions.length === 0
            ? {
                tone: "info",
                message: t("selection.alreadySelected", { name: template.name }),
              }
            : {
                tone: "success",
                message: t("selection.addedFrom", {
                  count: additions.length,
                  name: template.name,
                }),
              };

          setError(null);
          setNotice(resultNotice);

          if (additions.length === 0) {
            return current;
          }

          // Signal significant change
          onSelectionChange?.();

          return [
            ...current,
            ...additions.map((entry) => ({ code: entry.code, name: entry.display_name })),
          ];
        });
      } catch (err) {
        setNotice(null);
        setError(extractErrorMessage(err, t("errors.generic")));
      }
    },
    [onSelectionChange, t],
  );

  const handleApplyAddon = useCallback(
    (biomarkers: { code: string; name: string }[], packageName: string) => {
      const normalized = biomarkers
        .map((entry) => ({
          code: entry.code.trim(),
          name: entry.name.trim() || entry.code.trim(),
        }))
        .filter((entry) => entry.code.length > 0);

      if (normalized.length === 0) {
        return;
      }

      let additions: { code: string; name: string }[] = [];
      setSelected((current) => {
        const existing = new Set(current.map((item) => item.code));
        additions = normalized.filter((entry) => !existing.has(entry.code));
        if (additions.length === 0) {
          return current;
        }
        return [...current, ...additions];
      });

      if (additions.length === 0) {
        setError(null);
        setNotice({
          tone: "info",
          message: t("selection.alreadySelected", { name: packageName }),
        });
        return;
      }

      // Signal significant change
      onSelectionChange?.();
      setError(null);
      setNotice({
        tone: "success",
        message: t("selection.addedFrom", {
          count: additions.length,
          name: packageName,
        }),
      });
    },
    [onSelectionChange, t],
  );

  const handleLoadList = useCallback(
    (list: SavedList) => {
      setSelected(
        list.biomarkers.map((entry) => ({ code: entry.code, name: entry.display_name })),
      );
      onSelectionChange?.();
    },
    [onSelectionChange],
  );

  const clearError = useCallback(() => setError(null), []);
  const clearNotice = useCallback(() => setNotice(null), []);

  return {
    selected,
    biomarkerCodes,
    selectionPayload,
    notice,
    error,
    handleSelect,
    handleRemove,
    handleTemplateSelect,
    handleApplyAddon,
    handleLoadList,
    setSelected,
    setError,
    setNotice,
    clearError,
    clearNotice,
  };
}
