import type { OptimizeResponse } from "@panelyt/types";
import { Flame, Sparkles, Workflow } from "lucide-react";

import { formatCurrency } from "../lib/format";

function pillClass(
  tone: "add" | "replace" | "remove",
): string {
  switch (tone) {
    case "add":
      return "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40";
    case "remove":
      return "bg-rose-500/20 text-rose-200 border border-rose-400/40";
    default:
      return "bg-slate-800 text-slate-300 border border-slate-700";
  }
}

interface BiomarkerPillListProps {
  label: string;
  pills: OptimizeResponse["addon_suggestions"][number]["covers"];
  tone: "add" | "replace" | "remove";
  icon: React.ReactNode;
}

function BiomarkerPillList({ label, pills, tone, icon }: BiomarkerPillListProps) {
  if (!pills || pills.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        {icon}
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pills.map((pill) => (
          <span
            key={`${label}-${pill.code}`}
            className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${pillClass(tone)}`}
          >
            {pill.display_name}
          </span>
        ))}
      </div>
    </div>
  );
}

interface AddonSuggestionsPanelProps {
  suggestions?: OptimizeResponse["addon_suggestions"];
  onApply?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
}

export function AddonSuggestionsPanel({ suggestions = [], onApply }: AddonSuggestionsPanelProps) {
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
    <div className="mt-6 space-y-3">
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
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={`addon-${suggestion.package.id}`}
            className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner shadow-black/20"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  {suggestion.package.lab_name || suggestion.package.lab_code.toUpperCase()}
                </p>
                <p className="text-sm font-semibold text-white">{suggestion.package.name}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <BiomarkerPillList
                    label="Adds"
                    pills={suggestion.adds ?? []}
                    tone="add"
                    icon={<Sparkles className="h-3 w-3 text-emerald-300" />}
                  />
                  <BiomarkerPillList
                    label="Keeps bonus"
                    pills={suggestion.keeps ?? []}
                    tone="replace"
                    icon={<Workflow className="h-3 w-3 text-slate-400" />}
                  />
                  <BiomarkerPillList
                    label="Removes bonus"
                    pills={suggestion.removes ?? []}
                    tone="remove"
                    icon={<Flame className="h-3 w-3 text-rose-300" />}
                  />
                </div>
              </div>
              <div className="space-y-2 text-right text-xs text-slate-300">
                <div>
                  <p className="uppercase tracking-wide text-slate-400">Upgrade cost</p>
                  <p className="text-lg font-semibold text-emerald-200">
                    {formatCurrency(suggestion.upgrade_cost)}
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-slate-400">
                    Estimated total after upgrade
                  </p>
                  <p className="text-sm font-semibold text-slate-100">
                    {formatCurrency(suggestion.estimated_total_now)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleApply(suggestion)}
                  className="w-full rounded-full border border-emerald-500/60 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Apply suggestion
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
