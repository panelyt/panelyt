"use client";

import { useCallback, useState } from "react";
import { BiomarkerListTemplateSchema, type SavedList } from "@panelyt/types";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { getJson, extractErrorMessage } from "../lib/http";
import { track } from "../lib/analytics";
import { usePanelStore, type PanelBiomarker } from "../stores/panelStore";

export type SelectedBiomarker = PanelBiomarker;

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
  clearError: () => void;
}

const mergeSelections = (
  base: SelectedBiomarker[],
  additions: SelectedBiomarker[],
): SelectedBiomarker[] => {
  const seen = new Set<string>();
  const result: SelectedBiomarker[] = [];

  for (const entry of base) {
    const code = entry.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ ...entry, code });
  }

  for (const entry of additions) {
    const code = entry.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({ ...entry, code });
  }

  return result;
};

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

  const [error, setError] = useState<string | null>(null);
  // Derived values
  const biomarkerCodes = selected.map((b) => b.code);
  const selectionPayload = selected.map((item) => ({ code: item.code, name: item.name }));

  const handleSelect = useCallback(
    (biomarker: SelectedBiomarker) => {
      const code = biomarker.code.trim();
      if (!code) {
        return;
      }
      const snapshot = usePanelStore.getState().selected;
      const alreadySelected = snapshot.some((item) => item.code === code);
      addOne({ ...biomarker, code });
      setError(null);
      if (!alreadySelected) {
        toast(t("selection.added", { name: biomarker.name }));
      }
    },
    [addOne, t],
  );

  const handleRemove = useCallback(
    (code: string) => {
      const snapshot = usePanelStore.getState().selected;
      const removedIndex = snapshot.findIndex((item) => item.code === code);
      const removed = removedIndex === -1 ? undefined : snapshot[removedIndex];
      remove(code);
      if (removed) {
        toast(t("selection.removed", { name: removed.name }), {
          duration: 8_000,
          action: {
            label: t("selection.undo"),
            onClick: () => {
              const state = usePanelStore.getState();
              const alreadySelected = state.selected.some((item) => item.code === removed.code);
              if (alreadySelected) {
                return;
              }
              if (state.lastRemoved?.biomarker.code === removed.code) {
                state.undoLastRemoved();
                return;
              }
              state.restoreBiomarker(removed, removedIndex);
            },
          },
        });
      }
    },
    [remove, t],
  );

  const handleClearAll = useCallback(() => {
    const snapshot = usePanelStore.getState().selected;
    const count = snapshot.length;
    clearAll();
    setError(null);
    if (count > 0) {
      toast(t("selection.cleared", { count }), {
        duration: 8_000,
        action: {
          label: t("selection.undo"),
          onClick: () => {
            const state = usePanelStore.getState();
            if (state.selected.length === 0) {
              state.replaceAll(snapshot);
              return;
            }
            state.replaceAll(mergeSelections(snapshot, state.selected));
          },
        },
      });
    }
  }, [clearAll, t]);

  const handleTemplateSelect = useCallback(
    async (selection: { slug: string; name: string }) => {
      const { slug } = selection;
      try {
        const payload = await getJson(`/biomarker-lists/templates/${slug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);

        const current = usePanelStore.getState().selected;
        const existing = new Set(current.map((item) => item.code));
        const additions = template.biomarkers.filter((entry) => !existing.has(entry.code));

        const message = additions.length === 0
          ? t("selection.alreadySelected", { name: template.name })
          : t("selection.addedFrom", {
              count: additions.length,
              name: template.name,
            });
        setError(null);
        toast(message);

        if (additions.length === 0) {
          return;
        }

        addMany(
          additions.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );
        track("panel_apply_template", { mode: "append" });

        // Signal significant change
        onSelectionChange?.();
      } catch (err) {
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
        const message = t("selection.alreadySelected", { name: packageName });
        setError(null);
        toast(message);
        return;
      }

      addMany(additions);
      track("panel_apply_addon", { count: additions.length });

      // Signal significant change
      onSelectionChange?.();
      setError(null);
      const message = t("selection.addedFrom", {
        count: additions.length,
        name: packageName,
      });
      toast(message);
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
  return {
    selected,
    biomarkerCodes,
    selectionPayload,
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
    clearError,
  };
}
