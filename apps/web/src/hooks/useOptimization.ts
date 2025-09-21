"use client";

import { useQuery } from "@tanstack/react-query";
import { OptimizeResponseSchema, type OptimizeResponse } from "@panelyt/types";

import { postJson } from "../lib/http";

export function useOptimization(biomarkers: string[]) {
  const key = biomarkers.map((b) => b.toLowerCase()).sort().join("|");
  return useQuery<OptimizeResponse, Error>({
    queryKey: ["optimize", key],
    queryFn: async () => {
      const payload = await postJson("/optimize", { biomarkers });
      return OptimizeResponseSchema.parse(payload);
    },
    enabled: biomarkers.length > 0,
  });
}
