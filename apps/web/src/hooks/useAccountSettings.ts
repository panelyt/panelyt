"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccountSettingsSchema,
  TelegramLinkTokenResponseSchema,
  type AccountSettings,
  type TelegramLinkTokenResponse,
} from "@/lib/types";

import { getParsedJson, postParsedJson, postJson } from "../lib/http";

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
      return getParsedJson("/account/settings", AccountSettingsSchema);
    },
    staleTime: 60_000,
  });

  const updateCache = (data: TelegramLinkTokenResponse) => {
    queryClient.setQueryData(["account-settings"], toAccountSettings(data));
  };

  const linkTokenMutation = useMutation<TelegramLinkTokenResponse, Error>({
    mutationFn: async () => {
      return postParsedJson(
        "/account/telegram/link-token",
        TelegramLinkTokenResponseSchema,
      );
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
      return postParsedJson(
        "/account/telegram/manual-link",
        TelegramLinkTokenResponseSchema,
        { chat_id: chatId },
      );
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
