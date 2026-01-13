"use client";

import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerLookup(codes: string[]) {
  return useBiomarkerBatch(codes, {
    select: (data) => {
      const lookup: Record<string, string> = {};
      for (const code of codes) {
        lookup[code] = data[code]?.name ?? code;
      }
      return lookup;
    },
  });
}
