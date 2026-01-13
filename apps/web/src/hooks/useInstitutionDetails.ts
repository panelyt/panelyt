"use client";

import { useQuery } from "@tanstack/react-query";
import { InstitutionSchema, type Institution } from "@panelyt/types";

import { getParsedJson } from "../lib/http";

export function useInstitutionDetails(institutionId: number | null) {
  return useQuery<Institution, Error>({
    queryKey: ["institution-details", institutionId],
    queryFn: async () => {
      if (!institutionId) {
        throw new Error("Institution id is required");
      }
      return getParsedJson(`/institutions/${institutionId}`, InstitutionSchema);
    },
    enabled: Boolean(institutionId),
    staleTime: 60_000,
  });
}
