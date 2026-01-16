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
  nameEn: string;
  namePl: string;
  slug: string;
  descriptionEn: string;
  descriptionPl: string;
  isActive: boolean;
  error: string | null;
  isSaving: boolean;
  open: () => void;
  close: () => void;
  setNameEn: (name: string) => void;
  setNamePl: (name: string) => void;
  setSlug: (slug: string) => void;
  setDescriptionEn: (description: string) => void;
  setDescriptionPl: (description: string) => void;
  setIsActive: (isActive: boolean) => void;
  handleConfirm: () => Promise<void>;
}

export function useTemplateModal(
  options: UseTemplateModalOptions,
): UseTemplateModalResult {
  const t = useTranslations();
  const { biomarkers, onSuccess } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [nameEn, setNameEnState] = useState("");
  const [namePl, setNamePlState] = useState("");
  const [slug, setSlugState] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionPl, setDescriptionPl] = useState("");
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
    setNameEnState(defaultName);
    setNamePlState(defaultName);
    setSlugState(initialSlug);
    setDescriptionEn("");
    setDescriptionPl("");
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

  const setNameEn = useCallback(
    (value: string) => {
      setNameEnState(value);
      if (!slugTouched) {
        setSlugState(slugify(value || namePl));
      }
    },
    [namePl, slugTouched],
  );

  const setNamePl = useCallback(
    (value: string) => {
      setNamePlState(value);
      if (!slugTouched) {
        setSlugState(slugify(nameEn || value));
      }
    },
    [nameEn, slugTouched],
  );

  const setSlug = useCallback((value: string) => {
    setSlugState(value);
    setSlugTouched(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (biomarkers.length === 0) {
      setError(t("errors.templateNeedsBiomarkers"));
      return;
    }

    const trimmedNameEn = nameEn.trim();
    const trimmedNamePl = namePl.trim();
    const normalizedSlug = slugify(slug || nameEn || namePl);

    if (!trimmedNameEn) {
      setError(t("errors.templateNameEnEmpty"));
      return;
    }
    if (!trimmedNamePl) {
      setError(t("errors.templateNamePlEmpty"));
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
        name_en: trimmedNameEn,
        name_pl: trimmedNamePl,
        description_en: descriptionEn.trim() || null,
        description_pl: descriptionPl.trim() || null,
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
    nameEn,
    namePl,
    slug,
    descriptionEn,
    descriptionPl,
    isActive,
    templateAdmin.createMutation,
    onSuccess,
    close,
    t,
  ]);

  return {
    isOpen,
    nameEn,
    namePl,
    slug,
    descriptionEn,
    descriptionPl,
    isActive,
    error,
    isSaving,
    open,
    close,
    setNameEn,
    setNamePl,
    setSlug,
    setDescriptionEn,
    setDescriptionPl,
    setIsActive,
    handleConfirm,
  };
}
