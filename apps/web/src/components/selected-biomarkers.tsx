"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";

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
    <ul className="flex flex-wrap gap-2" role="list">
      {biomarkers.map((biomarker) => (
        <li
          key={biomarker.code}
          className="group flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-emerald-100 transition hover:border-emerald-300/60"
        >
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{biomarker.name}</span>
            <span
              className={cn(
                "max-h-0 overflow-hidden text-xs font-mono text-emerald-200/80 opacity-0 transition-all duration-150",
                "group-hover:max-h-5 group-hover:opacity-100",
                "group-focus-within:max-h-5 group-focus-within:opacity-100",
              )}
            >
              {biomarker.code}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(biomarker.code)}
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-200 transition hover:bg-red-500/20 hover:text-red-100 focus-ring"
            aria-label={t("common.remove", { name: biomarker.name })}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
