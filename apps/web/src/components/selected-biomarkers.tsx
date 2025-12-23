"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface Props {
  biomarkers: SelectedBiomarker[];
  onRemove: (code: string) => void;
}

export function SelectedBiomarkers({ biomarkers, onRemove }: Props) {
  const t = useTranslations();

  if (biomarkers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-400">
        {t("home.emptyBiomarkers")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {biomarkers.map((biomarker, index) => (
        <button
          key={`${biomarker.code}-${index}`}
          type="button"
          onClick={() => onRemove(biomarker.code)}
          className="group inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-red-400 hover:bg-red-500/20 hover:text-red-100"
          title={t("common.remove", { name: biomarker.name })}
        >
          <span>{biomarker.name}</span>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
