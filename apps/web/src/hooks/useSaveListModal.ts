"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";

import { useSavedLists } from "./useSavedLists";
import { extractErrorMessage } from "../lib/http";
import { track } from "../lib/analytics";

export interface UseSaveListModalOptions {
  /** Whether the user is authenticated (required for saving) */
  isAuthenticated: boolean;
  /** The biomarkers to save */
  biomarkers: { code: string; name: string }[];
  /** Called on successful save */
  onSuccess?: () => void;
  /** Called when an error should be shown outside the modal */
  onExternalError?: (message: string) => void;
  /** Called when authentication is required */
  onRequireAuth?: () => void;
}

export interface UseSaveListModalResult {
  isOpen: boolean;
  name: string;
  error: string | null;
  isSaving: boolean;
  open: (defaultName?: string) => void;
  close: () => void;
  setName: (name: string) => void;
  handleConfirm: () => Promise<void>;
}

export function useSaveListModal(
  options: UseSaveListModalOptions,
): UseSaveListModalResult {
  const t = useTranslations();
  const { isAuthenticated, biomarkers, onSuccess, onExternalError, onRequireAuth } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const savedLists = useSavedLists(isAuthenticated);

  const open = useCallback((defaultName?: string) => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    setName(defaultName ?? "");
    setError(null);
    setIsOpen(true);
  }, [isAuthenticated, onRequireAuth]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      close();
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("errors.listNameEmpty"));
      return;
    }

    if (biomarkers.length === 0) {
      const message = t("errors.listNeedsBiomarkers");
      setError(message);
      onExternalError?.(message);
      return;
    }

    setIsSaving(true);
    try {
      await savedLists.createMutation.mutateAsync({
        name: trimmed,
        biomarkers,
      });
      track("save_list_submit", { status: "success" });
      setError(null);
      onSuccess?.();
      close();
    } catch (err) {
      track("save_list_submit", { status: "failure" });
      const message = extractErrorMessage(err, t("errors.generic"));
      setError(message);
      onExternalError?.(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    isAuthenticated,
    onRequireAuth,
    name,
    biomarkers,
    savedLists.createMutation,
    onSuccess,
    onExternalError,
    close,
    t,
  ]);

  return {
    isOpen,
    name,
    error,
    isSaving,
    open,
    close,
    setName,
    handleConfirm,
  };
}
