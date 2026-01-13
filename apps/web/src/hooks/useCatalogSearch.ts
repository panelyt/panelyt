"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CatalogSearchResponseSchema,
  type CatalogSearchResponse,
} from "@panelyt/types";

import { getParsedJson } from "../lib/http";
import { useInstitution } from "./useInstitution";

export function useCatalogSearch(query: string) {
  const { institutionId } = useInstitution();
  return useQuery<CatalogSearchResponse, Error>({
    queryKey: ["catalog-search", query, institutionId],
    queryFn: async () => {
      return getParsedJson(
        `/catalog/search?query=${encodeURIComponent(query)}&institution=${institutionId}`,
        CatalogSearchResponseSchema,
      );
    },
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}
