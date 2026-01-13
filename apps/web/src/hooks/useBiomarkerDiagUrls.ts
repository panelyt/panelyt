"use client";

import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import { DIAG_SINGLE_ITEM_URL_BASE } from "../lib/diag";
import { useBiomarkerBatch } from "./useBiomarkerBatch";

export function useBiomarkerDiagUrls(
  codes: string[],
): UseQueryResult<Record<string, string | null>, Error> {
  const batch = useBiomarkerBatch(codes);
  const data = useMemo(() => {
    if (!batch.data) {
      return undefined;
    }
    const lookup: Record<string, string | null> = {};
    for (const code of codes) {
      const slug = batch.data[code]?.slug;
      lookup[code] = slug ? `${DIAG_SINGLE_ITEM_URL_BASE}/${slug}` : null;
    }
    return lookup;
  }, [batch.data, codes]);

  return {
    ...batch,
    data,
  };
}
