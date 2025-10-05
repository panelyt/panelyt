"use client";

import { useQuery } from "@tanstack/react-query";
import { CatalogMetaSchema, type CatalogMeta } from "@panelyt/types";

import { getParsedJson } from "../lib/http";

export function useCatalogMeta() {
  return useQuery<CatalogMeta, Error>({
    queryKey: ["catalog-meta"],
    queryFn: async () => {
      return getParsedJson("/catalog/meta", CatalogMetaSchema);
    },
    staleTime: 1000 * 60 * 5,
  });
}
