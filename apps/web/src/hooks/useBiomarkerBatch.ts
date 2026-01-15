"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Biomarker } from "@panelyt/types";

import {
  fetchBiomarkerBatch,
  normalizeBiomarkerBatchResults,
  normalizeBiomarkerCode,
} from "../lib/biomarkers";
import { useInstitution } from "./useInstitution";

export function useBiomarkerBatch<TData = Record<string, Biomarker | null>>(
  codes: string[],
  options?: {
    select?: (data: Record<string, Biomarker | null>) => TData;
  },
): UseQueryResult<TData, Error> {
  const { institutionId } = useInstitution();
  const normalizedCodes = codes
    .map((code) => normalizeBiomarkerCode(code))
    .filter(Boolean);
  const cacheKey = Array.from(new Set(normalizedCodes)).sort();
  return useQuery<Record<string, Biomarker | null>, Error, TData>({
    queryKey: ["biomarker-batch", cacheKey, institutionId],
    queryFn: async () => {
      const response = await fetchBiomarkerBatch(codes, institutionId);
      return normalizeBiomarkerBatchResults(response);
    },
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10,
    select: (data) => {
      const mapped: Record<string, Biomarker | null> = {};
      for (const code of codes) {
        const trimmed = code.trim();
        if (!trimmed) continue;
        const normalized = normalizeBiomarkerCode(trimmed);
        mapped[code] = normalized ? data[normalized] ?? null : null;
      }
      return options?.select ? options.select(mapped) : (mapped as TData);
    },
  });
}
