"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AccountSettingsSchema,
  TelegramLinkTokenResponseSchema,
  type AccountSettings,
  type TelegramLinkTokenResponse,
} from "@panelyt/types";

import {
  getParsedJson,
  patchParsedJson,
  postParsedJson,
  postJson,
} from "../lib/http";

const mergeAccountSettings = (
  response: TelegramLinkTokenResponse,
  current?: AccountSettings | null,
): AccountSettings => {
  return {
    telegram: response.telegram,
    preferred_institution_id: current?.preferred_institution_id ?? null,
    preferred_institution_label: current?.preferred_institution_label ?? null,
  };
};

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
    const current = queryClient.getQueryData<AccountSettings>(["account-settings"]);
    queryClient.setQueryData(["account-settings"], mergeAccountSettings(data, current));
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

  const updateSettingsMutation = useMutation<AccountSettings, Error, {
    preferred_institution_id: number | null;
  }>({
    mutationFn: async (payload) => {
      return patchParsedJson("/account/settings", AccountSettingsSchema, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["account-settings"], data);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  return {
    settingsQuery,
    linkTokenMutation,
    manualLinkMutation,
    unlinkMutation,
    updateSettingsMutation,
  };
}
