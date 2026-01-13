"use client";

import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerLookup(
  codes: string[],
): UseQueryResult<Record<string, string>, Error> {
  const batch = useBiomarkerBatch(codes);
  const data = useMemo(() => {
    if (!batch.data) {
      return undefined;
    }
    const lookup: Record<string, string> = {};
    for (const code of codes) {
      lookup[code] = batch.data[code]?.name ?? code;
    }
    return lookup;
  }, [batch.data, codes]);

  return {
    ...batch,
    data,
  };
}
