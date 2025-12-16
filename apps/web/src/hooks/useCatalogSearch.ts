"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CatalogSearchResponseSchema,
  type CatalogSearchResponse,
} from "@/lib/types";

import { getParsedJson } from "../lib/http";

export function useCatalogSearch(query: string) {
  return useQuery<CatalogSearchResponse, Error>({
    queryKey: ["catalog-search", query],
    queryFn: async () => {
      return getParsedJson(
        `/catalog/search?query=${encodeURIComponent(query)}`,
        CatalogSearchResponseSchema,
      );
    },
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}
