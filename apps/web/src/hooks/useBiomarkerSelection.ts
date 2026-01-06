"use client";

import { useCallback, useEffect, useState } from "react";
import { BiomarkerListTemplateSchema, type SavedList } from "@panelyt/types";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getJson, extractErrorMessage } from "../lib/http";
import { usePanelStore, type PanelBiomarker } from "../stores/panelStore";

export type SelectedBiomarker = PanelBiomarker;

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
  clearAll: () => void;
  handleTemplateSelect: (selection: { slug: string; name: string }) => Promise<void>;
  handleApplyAddon: (
    biomarkers: { code: string; name: string }[],
    packageName: string,
  ) => void;
  handleLoadList: (list: SavedList) => void;
  replaceAll: (biomarkers: SelectedBiomarker[]) => void;
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

  const selected = usePanelStore((state) => state.selected);
  const addOne = usePanelStore((state) => state.addOne);
  const addMany = usePanelStore((state) => state.addMany);
  const remove = usePanelStore((state) => state.remove);
  const clearAll = usePanelStore((state) => state.clearAll);
  const replaceAll = usePanelStore((state) => state.replaceAll);
  const undoLastRemoved = usePanelStore((state) => state.undoLastRemoved);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SelectionNotice | null>(null);

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

  const handleSelect = useCallback(
    (biomarker: SelectedBiomarker) => {
      addOne(biomarker);
      setError(null);
      setNotice(null);
    },
    [addOne],
  );

  const handleRemove = useCallback(
    (code: string) => {
      const removed = usePanelStore
        .getState()
        .selected.find((item) => item.code === code);
      remove(code);
      if (removed) {
        toast(t("selection.removed", { name: removed.name }), {
          duration: 10_000,
          action: {
            label: t("selection.undo"),
            onClick: () => undoLastRemoved(),
          },
        });
      }
    },
    [remove, t, undoLastRemoved],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    setError(null);
    setNotice(null);
  }, [clearAll]);

  const handleTemplateSelect = useCallback(
    async (selection: { slug: string; name: string }) => {
      const { slug } = selection;
      try {
        const payload = await getJson(`/biomarker-lists/templates/${slug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);

        const current = usePanelStore.getState().selected;
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
          return;
        }

        addMany(
          additions.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );

        // Signal significant change
        onSelectionChange?.();
      } catch (err) {
        setNotice(null);
        setError(extractErrorMessage(err, t("errors.generic")));
      }
    },
    [addMany, onSelectionChange, t],
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

      const current = usePanelStore.getState().selected;
      const existing = new Set(current.map((item) => item.code));
      const additions = normalized.filter((entry) => !existing.has(entry.code));

      if (additions.length === 0) {
        setError(null);
        setNotice({
          tone: "info",
          message: t("selection.alreadySelected", { name: packageName }),
        });
        return;
      }

      addMany(additions);

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
    [addMany, onSelectionChange, t],
  );

  const handleLoadList = useCallback(
    (list: SavedList) => {
      replaceAll(
        list.biomarkers.map((entry) => ({
          code: entry.code,
          name: entry.display_name,
        })),
      );
      onSelectionChange?.();
    },
    [onSelectionChange, replaceAll],
  );

  const setSelected = useCallback<React.Dispatch<React.SetStateAction<SelectedBiomarker[]>>>(
    (value) => {
      if (typeof value === "function") {
        const next = value(usePanelStore.getState().selected);
        replaceAll(next);
        return;
      }
      replaceAll(value);
    },
    [replaceAll],
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
    clearAll: handleClearAll,
    handleTemplateSelect,
    handleApplyAddon,
    handleLoadList,
    replaceAll,
    setSelected,
    setError,
    setNotice,
    clearError,
    clearNotice,
  };
}
