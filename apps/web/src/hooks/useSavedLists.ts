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
  SavedListNotificationsBulkResponseSchema,
  type SavedList,
  type SavedListShareResponse,
  type SavedListUpsert,
  type SavedListNotificationResponse,
  type SavedListNotificationsBulkResponse,
} from "@/lib/types";

import { deleteRequest, getParsedJson, postParsedJson, putParsedJson } from "../lib/http";

export function useSavedLists(enabled: boolean) {
  const queryClient = useQueryClient();

  const listsQuery = useQuery<SavedList[], Error>({
    queryKey: ["saved-lists"],
    enabled,
    queryFn: async () => {
      const parsed = await getParsedJson("/lists", SavedListCollectionSchema);
      return parsed.lists;
    },
  });

  const createMutation = useMutation<SavedList, Error, SavedListUpsert>({
    mutationFn: async (input) => {
      const payload = SavedListUpsertSchema.parse(input);
      return postParsedJson(`/lists`, SavedListSchema, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  const updateMutation = useMutation<SavedList, Error, { id: string; payload: SavedListUpsert }>({
    mutationFn: async ({ id, payload }) => {
      const parsed = SavedListUpsertSchema.parse(payload);
      return putParsedJson(`/lists/${id}`, SavedListSchema, parsed);
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
      return postParsedJson(`/lists/${id}/share`, SavedListShareResponseSchema, payload);
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
      return postParsedJson(
        `/lists/${id}/notifications`,
        SavedListNotificationResponseSchema,
        payload,
      );
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

  const notificationsBulkMutation = useMutation<
    SavedListNotificationsBulkResponse,
    Error,
    { notify: boolean }
  >({
    mutationFn: async ({ notify }) => {
      const payload = SavedListNotificationRequestSchema.parse({
        notify_on_price_drop: notify,
      });
      return postParsedJson(
        `/lists/notifications`,
        SavedListNotificationsBulkResponseSchema,
        payload,
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData<SavedList[] | undefined>(["saved-lists"], (current) => {
        if (!current) {
          return current;
        }
        if (result.lists.length === 0) {
          return current;
        }
        const updates = new Map(result.lists.map((item) => [item.list_id, item]));
        return current.map((saved) => {
          const update = updates.get(saved.id);
          if (!update) {
            return saved;
          }
          const notify = update.notify_on_price_drop;
          return {
            ...saved,
            notify_on_price_drop: notify,
            last_known_total_grosz: update.last_known_total_grosz,
            last_total_updated_at: update.last_total_updated_at,
            last_notified_total_grosz: notify ? saved.last_notified_total_grosz : null,
            last_notified_at: notify ? saved.last_notified_at : null,
          };
        });
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
    notificationsBulkMutation,
  };
}
