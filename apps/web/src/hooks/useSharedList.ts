"use client";

import { useQuery } from "@tanstack/react-query";
import { SavedListSchema, type SavedList } from "@panelyt/types";

import { getJson } from "../lib/http";

export function useSharedList(shareToken: string, enabled = true) {
  return useQuery<SavedList, Error>({
    queryKey: ["shared-list", shareToken],
    enabled: enabled && Boolean(shareToken),
    queryFn: async () => {
      const payload = await getJson(`/biomarker-lists/shared/${shareToken}`);
      return SavedListSchema.parse(payload);
    },
  });
}
