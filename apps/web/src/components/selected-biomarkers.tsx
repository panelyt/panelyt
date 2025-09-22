"use client";

import { X } from "lucide-react";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface Props {
  biomarkers: SelectedBiomarker[];
  onRemove: (code: string) => void;
}

export function SelectedBiomarkers({ biomarkers, onRemove }: Props) {
  if (biomarkers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-400">
        Add biomarkers to compare prices across single tests and bundles. We&apos;ll highlight
        packages that introduce bonus coverage along the way.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {biomarkers.map((biomarker) => (
        <button
          key={biomarker.code}
          type="button"
          onClick={() => onRemove(biomarker.code)}
          className="group inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:border-red-400 hover:bg-red-500/20 hover:text-red-100"
          title={`Remove ${biomarker.name}`}
        >
          <span>{biomarker.name}</span>
          <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-100 group-hover:bg-red-500/30 group-hover:text-red-100">
            {biomarker.code}
          </span>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
