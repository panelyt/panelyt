"use client";

import { useQuery } from "@tanstack/react-query";
import {
  InstitutionSearchResponseSchema,
  type InstitutionSearchResponse,
} from "@panelyt/types";

import { getParsedJson } from "../lib/http";

export function useInstitutionSearch(query: string, limit = 8) {
  const trimmed = query.trim();
  return useQuery<InstitutionSearchResponse, Error>({
    queryKey: ["institution-search", trimmed, limit],
    queryFn: async () => {
      return getParsedJson(
        `/institutions/search?q=${encodeURIComponent(trimmed)}&page=1&limit=${limit}`,
        InstitutionSearchResponseSchema,
      );
    },
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}
