"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";

import { useTemplateAdmin } from "./useTemplateAdmin";
import { extractErrorMessage } from "../lib/http";
import { slugify } from "../lib/slug";

export interface TemplateBiomarker {
  code: string;
  name: string;
}

export interface UseTemplateModalOptions {
  /** The biomarkers to include in the template */
  biomarkers: TemplateBiomarker[];
  /** Called on successful save */
  onSuccess?: () => void;
}

export interface UseTemplateModalResult {
  isOpen: boolean;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  error: string | null;
  isSaving: boolean;
  open: () => void;
  close: () => void;
  setName: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setIsActive: (isActive: boolean) => void;
  handleConfirm: () => Promise<void>;
}

export function useTemplateModal(
  options: UseTemplateModalOptions,
): UseTemplateModalResult {
  const t = useTranslations();
  const { biomarkers, onSuccess } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [name, setNameState] = useState("");
  const [slug, setSlugState] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const templateAdmin = useTemplateAdmin();

  const open = useCallback(() => {
    const defaultName = biomarkers.length
      ? t("templateModal.defaultName", {
          date: new Date().toLocaleDateString(),
        })
      : "";
    const initialSlug = defaultName ? slugify(defaultName) : "";
    setNameState(defaultName);
    setSlugState(initialSlug);
    setDescription("");
    setIsActive(true);
    setError(null);
    setSlugTouched(Boolean(initialSlug));
    setIsOpen(true);
  }, [biomarkers.length, t]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setSlugTouched(false);
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    if (!slugTouched) {
      setSlugState(slugify(value));
    }
  }, [slugTouched]);

  const setSlug = useCallback((value: string) => {
    setSlugState(value);
    setSlugTouched(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (biomarkers.length === 0) {
      setError(t("errors.templateNeedsBiomarkers"));
      return;
    }

    const trimmedName = name.trim();
    const normalizedSlug = slugify(slug || name);

    if (!trimmedName) {
      setError(t("errors.templateNameEmpty"));
      return;
    }
    if (!normalizedSlug) {
      setError(t("errors.templateSlugEmpty"));
      return;
    }

    setIsSaving(true);
    try {
      await templateAdmin.createMutation.mutateAsync({
        slug: normalizedSlug,
        name: trimmedName,
        description: description.trim() || null,
        is_active: isActive,
        biomarkers: biomarkers.map((entry) => ({
          code: entry.code,
          display_name: entry.name,
          notes: null,
        })),
      });
      setError(null);
      onSuccess?.();
      close();
    } catch (err) {
      setError(extractErrorMessage(err, t("errors.generic")));
    } finally {
      setIsSaving(false);
    }
  }, [
    biomarkers,
    name,
    slug,
    description,
    isActive,
    templateAdmin.createMutation,
    onSuccess,
    close,
    t,
  ]);

  return {
    isOpen,
    name,
    slug,
    description,
    isActive,
    error,
    isSaving,
    open,
    close,
    setName,
    setSlug,
    setDescription,
    setIsActive,
    handleConfirm,
  };
}
