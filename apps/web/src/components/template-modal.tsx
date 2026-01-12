"use client";

import { FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";

interface TemplateModalProps {
  open: boolean;
  title: string;
  submitLabel: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  error: string | null;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onIsActiveChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function TemplateModal({
  open,
  title,
  submitLabel,
  name,
  slug,
  description,
  isActive,
  error,
  isSubmitting,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
  onIsActiveChange,
  onClose,
  onConfirm,
}: TemplateModalProps) {
  const t = useTranslations();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onConfirm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="rounded-3xl border border-border/80 bg-surface-1 p-6 text-primary shadow-modal">
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-border/80 bg-surface-2 p-1 text-secondary transition hover:text-primary"
            aria-label={t("templateModal.closeDialog")}
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
          {t("common.brandName")}
        </p>
        <DialogTitle className="mt-2 text-2xl font-semibold text-primary">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-secondary">
          {t("templateModal.modalDescription")}
        </DialogDescription>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="template-name"
                className="text-xs font-semibold uppercase tracking-wide text-secondary"
              >
                {t("templateModal.templateName")}
              </label>
              <input
                id="template-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={t("templateModal.templateNamePlaceholder")}
                autoFocus
                className="w-full rounded-xl border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="template-slug"
                className="text-xs font-semibold uppercase tracking-wide text-secondary"
              >
                {t("templateModal.slug")}
              </label>
              <input
                id="template-slug"
                value={slug}
                onChange={(event) => onSlugChange(event.target.value)}
                placeholder={t("templateModal.slugPlaceholder")}
                className="w-full rounded-xl border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="template-description"
              className="text-xs font-semibold uppercase tracking-wide text-secondary"
            >
              {t("templateModal.description")}
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={t("templateModal.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-xl border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-2 px-4 py-3 text-sm text-secondary">
            <span className="font-semibold text-primary">
              {t("templateModal.isActive")}
            </span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => onIsActiveChange(event.target.checked)}
              className="h-4 w-4 accent-accent-emerald"
            />
          </label>

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-cyan px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
