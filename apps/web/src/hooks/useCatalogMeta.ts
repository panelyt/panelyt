"use client";

import { useQuery } from "@tanstack/react-query";
import { CatalogMetaSchema, type CatalogMeta } from "@panelyt/types";

import { getJson } from "../lib/http";

export function useCatalogMeta() {
  return useQuery<CatalogMeta, Error>({
    queryKey: ["catalog-meta"],
    queryFn: async () => {
      const payload = await getJson("/catalog/meta");
      return CatalogMetaSchema.parse(payload);
    },
    staleTime: 1000 * 60 * 5,
  });
}
