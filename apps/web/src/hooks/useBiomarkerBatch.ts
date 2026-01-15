"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Biomarker } from "@panelyt/types";

import { fetchBiomarkerBatch, normalizeBiomarkerCode } from "../lib/biomarkers";
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
    queryFn: async () => fetchBiomarkerBatch(codes, institutionId),
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10,
    select: options?.select,
  });
}
