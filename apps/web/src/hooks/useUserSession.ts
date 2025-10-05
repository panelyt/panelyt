"use client";

import { useQuery } from "@tanstack/react-query";
import { SessionResponseSchema, type SessionResponse } from "@panelyt/types";

import { HttpError, postParsedJson } from "../lib/http";

export function useUserSession() {
  return useQuery<SessionResponse | null, Error>({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await postParsedJson("/users/session", SessionResponseSchema);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
