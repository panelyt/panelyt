import type { OptimizeResponse } from "@panelyt/types";
import { Flame, Sparkles, Workflow } from "lucide-react";

import { formatCurrency } from "../lib/format";

interface AddonSuggestionsPanelProps {
  suggestions?: OptimizeResponse["addon_suggestions"];
  onApply?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-200">
            <Sparkles className="h-4 w-4" />
            Suggested add-ons
          </h3>
          <p className="text-xs text-slate-400">
            Looking for packages that unlock more biomarkers…
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {[1, 2].map((i) => (
          <div
            key={`skeleton-${i}`}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 blur-[2px] opacity-50"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <div className="h-3 w-16 rounded bg-slate-700 animate-pulse" />
                <div className="mt-2 h-4 w-48 rounded bg-slate-600 animate-pulse" />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex h-5 w-20 rounded-full bg-emerald-500/20 animate-pulse" />
                  <span className="inline-flex h-5 w-24 rounded-full bg-emerald-500/20 animate-pulse" />
                  <span className="inline-flex h-5 w-16 rounded-full bg-slate-800 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2 text-right">
                <div>
                  <div className="h-3 w-12 rounded bg-slate-700 animate-pulse ml-auto" />
                  <div className="mt-1 h-6 w-16 rounded bg-emerald-500/30 animate-pulse ml-auto" />
                </div>
                <div>
                  <div className="h-3 w-16 rounded bg-slate-700 animate-pulse ml-auto" />
                  <div className="mt-1 h-4 w-14 rounded bg-slate-600 animate-pulse ml-auto" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AddonSuggestionsPanel({ suggestions = [], onApply, isLoading }: AddonSuggestionsPanelProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const handleApply = (suggestion: OptimizeResponse["addon_suggestions"][number]) => {
    if (!onApply) {
      return;
    }
    const additions = (suggestion.adds ?? []).map((entry) => ({
      code: entry.code,
      name: entry.display_name,
    }));
    onApply(additions, suggestion.package.name);
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-200">
            <Sparkles className="h-4 w-4" />
            Suggested add-ons
          </h3>
          <p className="text-xs text-slate-400">
            Packages from the selected lab that unlock more biomarkers for the panel.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {suggestions.map((suggestion) => (
          <button
            key={`addon-${suggestion.package.id}`}
            type="button"
            onClick={() => handleApply(suggestion)}
            className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-emerald-400/40 hover:bg-slate-900"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  {suggestion.package.lab_name || suggestion.package.lab_code.toUpperCase()}
                </p>
                <p className="text-sm font-semibold text-white">{suggestion.package.name}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(suggestion.adds ?? []).map((pill) => (
                    <span
                      key={`add-${pill.code}`}
                      className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
                    >
                      <Sparkles className="mr-1 h-3 w-3" />
                      {pill.display_name}
                    </span>
                  ))}
                  {(suggestion.keeps ?? []).map((pill) => (
                    <span
                      key={`keep-${pill.code}`}
                      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                    >
                      <Workflow className="mr-1 h-3 w-3" />
                      {pill.display_name}
                    </span>
                  ))}
                  {(suggestion.removes ?? []).map((pill) => (
                    <span
                      key={`remove-${pill.code}`}
                      className="inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200"
                    >
                      <Flame className="mr-1 h-3 w-3" />
                      {pill.display_name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2 text-right text-xs text-slate-300">
                <div>
                  <p className="uppercase tracking-wide text-slate-400">Cost</p>
                  <p className="text-lg font-semibold text-emerald-200">
                    {formatCurrency(suggestion.upgrade_cost)}
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-slate-400">
                    New Total
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {formatCurrency(suggestion.estimated_total_now)}
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
