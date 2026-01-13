"use client";

import { DIAG_SINGLE_ITEM_URL_BASE } from "../lib/diag";
import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerDiagUrls(codes: string[]) {
  return useBiomarkerBatch(codes, {
    select: (data) => {
      const lookup: Record<string, string | null> = {};
      for (const code of codes) {
        const slug = data[code]?.slug;
        lookup[code] = slug ? `${DIAG_SINGLE_ITEM_URL_BASE}/${slug}` : null;
      }
      return lookup;
    },
  });
}
