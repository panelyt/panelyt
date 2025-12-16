"use client";

import { useQuery } from "@tanstack/react-query";
import { SavedListSchema, type SavedList } from "@/lib/types";

import { getParsedJson } from "../lib/http";

export function useSharedList(shareToken: string, enabled = true) {
  return useQuery<SavedList, Error>({
    queryKey: ["shared-list", shareToken],
    enabled: enabled && Boolean(shareToken),
    queryFn: async () => {
      return getParsedJson(`/biomarker-lists/shared/${shareToken}`, SavedListSchema);
    },
  });
}
