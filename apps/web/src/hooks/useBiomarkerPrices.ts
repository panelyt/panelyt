"use client";

import { useQuery } from "@tanstack/react-query";
import { BiomarkerSearchResponseSchema } from "@panelyt/types";

import { getJson } from "../lib/http";
import { findBiomarkerMatch } from "../lib/biomarkers";
import { useInstitution } from "./useInstitution";

export function useBiomarkerPrices(codes: string[]) {
  const { institutionId } = useInstitution();
  return useQuery<Record<string, number | null>, Error>({
    queryKey: ["biomarker-prices", [...codes].sort(), institutionId],
    queryFn: async () => {
      const lookup: Record<string, number | null> = {};

      for (const rawCode of codes) {
        const code = rawCode.trim();
        if (!code) {
          continue;
        }
        lookup[code] = null;
        try {
          const payload = await getJson(
            `/catalog/biomarkers?query=${encodeURIComponent(code)}&institution=${institutionId}`,
          );
          const response = BiomarkerSearchResponseSchema.parse(payload);
          const match = findBiomarkerMatch(response.results, code);
          if (match?.price_now_grosz !== null && match?.price_now_grosz !== undefined) {
            lookup[code] = match.price_now_grosz;
          }
        } catch {
          // Keep fallback null price.
        }
      }

      return lookup;
    },
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10,
  });
}
