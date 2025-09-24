"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CredentialsSchema,
  SessionResponseSchema,
  type Credentials,
  type SessionResponse,
} from "@panelyt/types";

import { postJson } from "../lib/http";

export function useAuth() {
  const queryClient = useQueryClient();

  const loginMutation = useMutation<SessionResponse, Error, Credentials>({
    mutationFn: async (credentials) => {
      const parsed = CredentialsSchema.parse(credentials);
      const payload = await postJson("/users/login", parsed);
      return SessionResponseSchema.parse(payload);
    },
    onSuccess: (session) => {
      queryClient.setQueryData(["session"], session);
    },
  });

  const registerMutation = useMutation<SessionResponse, Error, Credentials>({
    mutationFn: async (credentials) => {
      const parsed = CredentialsSchema.parse(credentials);
      const payload = await postJson("/users/register", parsed);
      return SessionResponseSchema.parse(payload);
    },
    onSuccess: (session) => {
      queryClient.setQueryData(["session"], session);
    },
  });

  const logoutMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      await postJson<void>("/users/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["session"], null);
      queryClient.invalidateQueries({ queryKey: ["saved-lists"] });
    },
  });

  return {
    loginMutation,
    registerMutation,
    logoutMutation,
  };
}
