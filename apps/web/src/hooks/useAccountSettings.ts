"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccountSettingsSchema,
  TelegramLinkTokenResponseSchema,
  type AccountSettings,
  type TelegramLinkTokenResponse,
} from "@panelyt/types";

import { getJson, postJson } from "../lib/http";

function toAccountSettings(response: TelegramLinkTokenResponse): AccountSettings {
  return {
    telegram: response.telegram,
  };
}

export function useAccountSettings(enabled: boolean) {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery<AccountSettings, Error>({
    queryKey: ["account-settings"],
    enabled,
    queryFn: async () => {
      const payload = await getJson("/account/settings");
      return AccountSettingsSchema.parse(payload);
    },
    staleTime: 60_000,
  });

  const updateCache = (data: TelegramLinkTokenResponse) => {
    queryClient.setQueryData(["account-settings"], toAccountSettings(data));
  };

  const linkTokenMutation = useMutation<TelegramLinkTokenResponse, Error>({
    mutationFn: async () => {
      const response = await postJson("/account/telegram/link-token");
      return TelegramLinkTokenResponseSchema.parse(response);
    },
    onSuccess: (data) => {
      updateCache(data);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  const manualLinkMutation = useMutation<TelegramLinkTokenResponse, Error, string>({
    mutationFn: async (chatId) => {
      const response = await postJson("/account/telegram/manual-link", { chat_id: chatId });
      return TelegramLinkTokenResponseSchema.parse(response);
    },
    onSuccess: (data) => {
      updateCache(data);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  const unlinkMutation = useMutation<void, Error>({
    mutationFn: async () => {
      await postJson<void>("/account/telegram/unlink");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  return {
    settingsQuery,
    linkTokenMutation,
    manualLinkMutation,
    unlinkMutation,
  };
}
