"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CatalogSearchResponseSchema,
  type CatalogSearchResponse,
} from "@panelyt/types";

import { getJson } from "../lib/http";

export function useCatalogSearch(query: string) {
  return useQuery<CatalogSearchResponse, Error>({
    queryKey: ["catalog-search", query],
    queryFn: async () => {
      const payload = await getJson(`/catalog/search?query=${encodeURIComponent(query)}`);
      return CatalogSearchResponseSchema.parse(payload);
    },
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}
