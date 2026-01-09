"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  OptimizeResponseSchema,
  type OptimizeResponse,
  AddonSuggestionsResponseSchema,
  type AddonSuggestionsResponse,
} from "@panelyt/types";

import { useDebounce } from "./useDebounce";
import { postParsedJson } from "../lib/http";

const OPTIMIZATION_DEBOUNCE_MS = 400;

export function useOptimization(
  biomarkers: string[],
): UseQueryResult<OptimizeResponse, Error> & {
  optimizationKey: string;
  debouncedBiomarkers: string[];
} {
  const debouncedBiomarkers = useDebounce(biomarkers, OPTIMIZATION_DEBOUNCE_MS);
  const key = debouncedBiomarkers.map((b) => b.toLowerCase()).sort().join("|");
  const query = useQuery<OptimizeResponse, Error>({
    queryKey: ["optimize", key],
    queryFn: async ({ signal }) => {
      return postParsedJson(
        "/optimize",
        OptimizeResponseSchema,
        {
          biomarkers: debouncedBiomarkers,
        },
        { signal },
      );
    },
    enabled: debouncedBiomarkers.length > 0,
  });
  return {
    ...query,
    optimizationKey: key,
    debouncedBiomarkers,
  };
}

export function useAddonSuggestions(
  biomarkers: string[],
  selectedItemIds: number[],
  enabled: boolean = true,
) {
  const debouncedBiomarkers = useDebounce(biomarkers, OPTIMIZATION_DEBOUNCE_MS);
  const key = debouncedBiomarkers.map((b) => b.toLowerCase()).sort().join("|");
  const itemsKey = [...selectedItemIds].sort((a, b) => a - b).join(",");
  return useQuery<AddonSuggestionsResponse, Error>({
    queryKey: ["optimize-addons", key, itemsKey],
    queryFn: async ({ signal }) => {
      return postParsedJson(
        "/optimize/addons",
        AddonSuggestionsResponseSchema,
        {
          biomarkers: debouncedBiomarkers,
          selected_item_ids: selectedItemIds,
        },
        { signal },
      );
    },
    enabled: enabled && debouncedBiomarkers.length > 0 && selectedItemIds.length > 0,
  });
}
