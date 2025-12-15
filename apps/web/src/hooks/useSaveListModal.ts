"use client";

import { useState, useCallback } from "react";

import { useSavedLists } from "./useSavedLists";
import { extractErrorMessage } from "../lib/http";

export interface UseSaveListModalOptions {
  /** Whether the user is authenticated (required for saving) */
  isAuthenticated: boolean;
  /** The biomarkers to save */
  biomarkers: { code: string; name: string }[];
  /** Called on successful save */
  onSuccess?: () => void;
  /** Called when an error should be shown outside the modal */
  onExternalError?: (message: string) => void;
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
  const { isAuthenticated, biomarkers, onSuccess, onExternalError } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const savedLists = useSavedLists(isAuthenticated);

  const open = useCallback((defaultName?: string) => {
    setName(defaultName ?? "");
    setError(null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }

    if (biomarkers.length === 0) {
      const message = "Add biomarkers before saving a list.";
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
      setError(null);
      onSuccess?.();
      close();
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      onExternalError?.(message);
    } finally {
      setIsSaving(false);
    }
  }, [name, biomarkers, savedLists.createMutation, onSuccess, onExternalError, close]);

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
