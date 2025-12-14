"use client";

import { useQuery } from "@tanstack/react-query";
import {
  OptimizeModeSchema,
  type OptimizeMode,
  OptimizeResponseSchema,
  type OptimizeResponse,
  AddonSuggestionsResponseSchema,
  type AddonSuggestionsResponse,
} from "@panelyt/types";

import { postParsedJson } from "../lib/http";

export function useOptimization(
  biomarkers: string[],
  mode: OptimizeMode,
  labCode?: string | null,
) {
  const key = biomarkers.map((b) => b.toLowerCase()).sort().join("|");
  const normalizedLab = labCode?.trim().toLowerCase() ?? null;
  const resolvedMode = OptimizeModeSchema.parse(mode ?? "auto");
  return useQuery<OptimizeResponse, Error>({
    queryKey: ["optimize", key, resolvedMode, normalizedLab],
    queryFn: async () => {
      return postParsedJson(
        "/optimize",
        OptimizeResponseSchema,
        {
          biomarkers,
          mode: resolvedMode,
          ...(resolvedMode === "single_lab" && normalizedLab
            ? { lab_code: normalizedLab }
            : {}),
        },
      );
    },
    enabled:
      biomarkers.length > 0 &&
      (resolvedMode !== "single_lab" || Boolean(normalizedLab)),
  });
}

export function useAddonSuggestions(
  biomarkers: string[],
  selectedItemIds: number[],
  labCode?: string | null,
) {
  const key = biomarkers.map((b) => b.toLowerCase()).sort().join("|");
  const itemsKey = selectedItemIds.sort((a, b) => a - b).join(",");
  const normalizedLab = labCode?.trim().toLowerCase() ?? null;
  return useQuery<AddonSuggestionsResponse, Error>({
    queryKey: ["optimize-addons", key, itemsKey, normalizedLab],
    queryFn: async () => {
      return postParsedJson(
        "/optimize/addons",
        AddonSuggestionsResponseSchema,
        {
          biomarkers,
          selected_item_ids: selectedItemIds,
          ...(normalizedLab ? { lab_code: normalizedLab } : {}),
        },
      );
    },
    enabled: biomarkers.length > 0 && selectedItemIds.length > 0,
  });
}
