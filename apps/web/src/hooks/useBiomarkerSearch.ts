"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BiomarkerSearchResponseSchema,
  type BiomarkerSearchResponse,
} from "@/lib/types";

import { getParsedJson } from "../lib/http";

export function useBiomarkerSearch(query: string) {
  return useQuery<BiomarkerSearchResponse, Error>({
    queryKey: ["biomarker-search", query],
    queryFn: async () => {
      return getParsedJson(
        `/catalog/biomarkers?query=${encodeURIComponent(query)}`,
        BiomarkerSearchResponseSchema,
      );
    },
    enabled: query.length >= 2,
    staleTime: 1000 * 60,
  });
}
