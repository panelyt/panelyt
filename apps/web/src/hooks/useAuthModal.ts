"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";

import { useAuth } from "./useAuth";
import { useUserSession } from "./useUserSession";
import { extractErrorMessage } from "../lib/http";

export type AuthMode = "login" | "register";

export interface UseAuthModalOptions {
  /** Called after successful login or register */
  onAuthSuccess?: () => void;
  /** Called when logout fails */
  onLogoutError?: (error: string) => void;
}

export interface UseAuthModalResult {
  isOpen: boolean;
  mode: AuthMode;
  error: string | null;
  isLoggingIn: boolean;
  isRegistering: boolean;
  isLoggingOut: boolean;
  open: (mode: AuthMode) => void;
  close: () => void;
  setMode: (mode: AuthMode) => void;
  handleLogin: (credentials: { username: string; password: string }) => Promise<void>;
  handleRegister: (credentials: { username: string; password: string }) => Promise<void>;
  handleLogout: () => Promise<void>;
}

export function useAuthModal(
  options: UseAuthModalOptions = {},
): UseAuthModalResult {
  const t = useTranslations();
  const { onAuthSuccess, onLogoutError } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  const sessionQuery = useUserSession();

  const open = useCallback((openMode: AuthMode) => {
    setMode(openMode);
    setIsOpen(true);
    setError(null);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const handleLogin = useCallback(
    async (credentials: { username: string; password: string }) => {
      try {
        setError(null);
        await auth.loginMutation.mutateAsync(credentials);
        await sessionQuery.refetch();
        onAuthSuccess?.();
        close();
      } catch (err) {
        setError(extractErrorMessage(err, t("errors.generic")));
      }
    },
    [auth.loginMutation, sessionQuery, onAuthSuccess, close, t],
  );

  const handleRegister = useCallback(
    async (credentials: { username: string; password: string }) => {
      try {
        setError(null);
        await auth.registerMutation.mutateAsync(credentials);
        await sessionQuery.refetch();
        onAuthSuccess?.();
        close();
      } catch (err) {
        setError(extractErrorMessage(err, t("errors.generic")));
      }
    },
    [auth.registerMutation, sessionQuery, onAuthSuccess, close, t],
  );

  const handleLogout = useCallback(async () => {
    try {
      await auth.logoutMutation.mutateAsync();
      await sessionQuery.refetch();
      onAuthSuccess?.();
    } catch (err) {
      const message = extractErrorMessage(err, t("errors.generic"));
      onLogoutError?.(message);
    }
  }, [auth.logoutMutation, sessionQuery, onAuthSuccess, onLogoutError, t]);

  return {
    isOpen,
    mode,
    error,
    isLoggingIn: auth.loginMutation.isPending,
    isRegistering: auth.registerMutation.isPending,
    isLoggingOut: auth.logoutMutation.isPending,
    open,
    close,
    setMode,
    handleLogin,
    handleRegister,
    handleLogout,
  };
}
