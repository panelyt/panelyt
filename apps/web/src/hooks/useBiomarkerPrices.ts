"use client";

import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerPrices(codes: string[]) {
  return useBiomarkerBatch(codes, {
    select: (data) => {
      const lookup: Record<string, number | null> = {};
      for (const code of codes) {
        lookup[code] = data[code]?.price_now_grosz ?? null;
      }
      return lookup;
    },
  });
}
