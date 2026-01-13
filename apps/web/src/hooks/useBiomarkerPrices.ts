"use client";

import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerPrices(
  codes: string[],
): UseQueryResult<Record<string, number | null>, Error> {
  const batch = useBiomarkerBatch(codes);
  const data = useMemo(() => {
    if (!batch.data) {
      return undefined;
    }
    const lookup: Record<string, number | null> = {};
    for (const code of codes) {
      lookup[code] = batch.data[code]?.price_now_grosz ?? null;
    }
    return lookup;
  }, [batch.data, codes]);

  return {
    ...batch,
    data,
  };
}
