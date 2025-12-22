"use client";

import { FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

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

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/90 p-6 text-slate-100 shadow-2xl shadow-slate-900/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-700/70 bg-slate-900/70 p-1 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="Close template dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Panelyt</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {t("templateModal.modalDescription")}
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="template-name"
                className="text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                {t("templateModal.templateName")}
              </label>
              <input
                id="template-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder={t("templateModal.templateNamePlaceholder")}
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="template-slug"
                className="text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                {t("templateModal.slug")}
              </label>
              <input
                id="template-slug"
                value={slug}
                onChange={(event) => onSlugChange(event.target.value)}
                placeholder={t("templateModal.slugPlaceholder")}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="template-description"
              className="text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              {t("templateModal.description")}
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder={t("templateModal.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <span className="font-semibold">{t("templateModal.isActive")}</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => onIsActiveChange(event.target.checked)}
              className="h-4 w-4 accent-emerald-400"
            />
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
