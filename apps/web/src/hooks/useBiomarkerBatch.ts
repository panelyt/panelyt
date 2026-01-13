"use client";

import { useQuery } from "@tanstack/react-query";
import type { Biomarker } from "@panelyt/types";

import { fetchBiomarkerBatch } from "../lib/biomarkers";
import { useInstitution } from "./useInstitution";

export function useBiomarkerBatch(codes: string[]) {
  const { institutionId } = useInstitution();
  return useQuery<Record<string, Biomarker | null>, Error>({
    queryKey: ["biomarker-batch", [...codes].sort(), institutionId],
    queryFn: async () => fetchBiomarkerBatch(codes, institutionId),
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10,
  });
}
