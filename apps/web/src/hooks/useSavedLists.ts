"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SavedListCollectionSchema,
  SavedListSchema,
  SavedListUpsertSchema,
  type SavedList,
  type SavedListUpsert,
} from "@panelyt/types";

import { deleteRequest, getJson, postJson, putJson } from "../lib/http";

export function useSavedLists(enabled: boolean) {
  const queryClient = useQueryClient();

  const listsQuery = useQuery<SavedList[], Error>({
    queryKey: ["saved-lists"],
    enabled,
    queryFn: async () => {
      const payload = await getJson("/lists");
      const parsed = SavedListCollectionSchema.parse(payload);
      return parsed.lists;
    },
  });

  const createMutation = useMutation<SavedList, Error, SavedListUpsert>({
    mutationFn: async (input) => {
      const payload = SavedListUpsertSchema.parse(input);
      const response = await postJson(`/lists`, payload);
      return SavedListSchema.parse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  const updateMutation = useMutation<SavedList, Error, { id: string; payload: SavedListUpsert }>({
    mutationFn: async ({ id, payload }) => {
      const parsed = SavedListUpsertSchema.parse(payload);
      const response = await putJson(`/lists/${id}`, parsed);
      return SavedListSchema.parse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await deleteRequest(`/lists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  return {
    listsQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
