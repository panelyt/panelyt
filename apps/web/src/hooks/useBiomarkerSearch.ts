"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BiomarkerSearchResponseSchema,
  type BiomarkerSearchResponse,
} from "@panelyt/types";

import { getJson } from "../lib/http";

export function useBiomarkerSearch(query: string) {
  return useQuery<BiomarkerSearchResponse, Error>({
    queryKey: ["biomarker-search", query],
    queryFn: async () => {
      const payload = await getJson(`/catalog/biomarkers?query=${encodeURIComponent(query)}`);
      return BiomarkerSearchResponseSchema.parse(payload);
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60,
  });
}
