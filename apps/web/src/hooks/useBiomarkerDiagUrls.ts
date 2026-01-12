"use client";

import { useQuery } from "@tanstack/react-query";
import { BiomarkerSearchResponseSchema } from "@panelyt/types";

import { DIAG_SINGLE_ITEM_URL_BASE } from "../lib/diag";
import { getJson } from "../lib/http";

const normalizeToken = (value: string | null | undefined) => value?.trim().toLowerCase();

export function useBiomarkerDiagUrls(codes: string[]) {
  return useQuery<Record<string, string | null>, Error>({
    queryKey: ["biomarker-diag-urls", [...codes].sort()],
    queryFn: async () => {
      const lookup: Record<string, string | null> = {};

      for (const rawCode of codes) {
        const code = rawCode.trim();
        if (!code) {
          continue;
        }
        lookup[code] = null;
        try {
          const payload = await getJson(`/catalog/biomarkers?query=${encodeURIComponent(code)}`);
          const response = BiomarkerSearchResponseSchema.parse(payload);
          const normalizedCode = normalizeToken(code);
          const match = response.results.find((result) => {
            const normalizedElab = normalizeToken(result.elab_code);
            const normalizedSlug = normalizeToken(result.slug);
            const normalizedName = normalizeToken(result.name);
            return (
              normalizedElab === normalizedCode ||
              normalizedSlug === normalizedCode ||
              normalizedName === normalizedCode
            );
          });
          if (match?.slug) {
            lookup[code] = `${DIAG_SINGLE_ITEM_URL_BASE}/${match.slug}`;
          }
        } catch {
          // Fallback is null; link rendering can handle it.
        }
      }

      return lookup;
    },
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10,
  });
}
