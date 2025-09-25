"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SavedListCollectionSchema,
  SavedListSchema,
  SavedListShareRequestSchema,
  SavedListShareResponseSchema,
  SavedListUpsertSchema,
  SavedListNotificationRequestSchema,
  SavedListNotificationResponseSchema,
  type SavedList,
  type SavedListShareResponse,
  type SavedListUpsert,
  type SavedListNotificationResponse,
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

  const shareMutation = useMutation<
    SavedListShareResponse,
    Error,
    { id: string; regenerate?: boolean }
  >({
    mutationFn: async ({ id, regenerate }) => {
      const payload = SavedListShareRequestSchema.parse({ regenerate });
      const response = await postJson(`/lists/${id}/share`, payload);
      const parsed = SavedListShareResponseSchema.parse(response);
      return parsed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  const notificationsMutation = useMutation<
    SavedListNotificationResponse,
    Error,
    { id: string; notify: boolean }
  >({
    mutationFn: async ({ id, notify }) => {
      const payload = SavedListNotificationRequestSchema.parse({
        notify_on_price_drop: notify,
      });
      const response = await postJson(`/lists/${id}/notifications`, payload);
      return SavedListNotificationResponseSchema.parse(response);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<SavedList[] | undefined>(["saved-lists"], (current) => {
        if (!current) {
          return current;
        }
        return current.map((saved) =>
          saved.id === result.list_id
            ? {
                ...saved,
                notify_on_price_drop: result.notify_on_price_drop,
                last_known_total_grosz: result.last_known_total_grosz,
                last_total_updated_at: result.last_total_updated_at,
              }
            : saved,
        );
      });
    },
  });

  const unshareMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await deleteRequest(`/lists/${id}/share`);
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
    shareMutation,
    unshareMutation,
    notificationsMutation,
  };
}
