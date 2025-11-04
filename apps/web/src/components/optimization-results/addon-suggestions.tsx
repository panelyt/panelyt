import { Sparkles } from "lucide-react";

import type { AddonSuggestionViewModel } from "./view-model";

interface AddonSuggestionsProps {
  addons: AddonSuggestionViewModel[];
  isDark: boolean;
  onApply?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
}

export function AddonSuggestionsSection({ addons, isDark, onApply }: AddonSuggestionsProps) {
  if (addons.length === 0) {
    return null;
  }

  const handleClick = (addon: AddonSuggestionViewModel) => {
    if (!onApply) {
      return;
    }
    const additions = addon.adds.map((entry) => ({
      code: entry.code,
      name: entry.display_name,
    }));
    onApply(additions, addon.package.name);
  };

  return (
    <div
      className={`rounded-2xl border p-5 ${
        isDark
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <div className="flex items-center gap-2 text-emerald-500">
        <Sparkles className="h-4 w-4" />
        <h3 className="text-sm font-semibold uppercase tracking-wide">Suggested add-ons</h3>
      </div>
      <p
        className={`mt-2 text-sm ${isDark ? "text-emerald-100/90" : "text-emerald-900/80"}`}
      >
        Upgrade to these bundles to unlock extra biomarkers for a small additional cost.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {addons.map((addon) => {
          const addsLabel =
            addon.adds.length > 0
              ? addon.adds.map((entry) => entry.display_name).join(", ")
              : "No additional biomarkers";
          const coversLabel = addon.covers.map((entry) => entry.display_name).join(", ");
          const nameClass = isDark
            ? "text-slate-100 group-hover:text-white"
            : "text-slate-900 group-hover:text-emerald-700";
          const labLabelClass = isDark
            ? "text-emerald-400/90"
            : "text-emerald-700/80";
          const replacesClass = isDark
            ? "text-emerald-200/80"
            : "text-emerald-700/80";
          const upgradeLabelClass = isDark
            ? "text-emerald-200/70"
            : "text-emerald-600/70";
          const upgradeValueClass = isDark
            ? "text-emerald-100"
            : "text-emerald-600";
          const addsBoxClass = isDark
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100/90"
            : "border-emerald-200 bg-emerald-100/50 text-emerald-900/80";
          const totalLabelClass = isDark
            ? "text-emerald-200/80"
            : "text-emerald-700/80";
          const totalValueClass = isDark
            ? "text-emerald-100"
            : "text-emerald-600";

          return (
            <button
              key={addon.key}
              type="button"
              onClick={() => handleClick(addon)}
              className={`group flex h-full flex-col gap-3 rounded-xl border p-4 text-left transition ${
                isDark
                  ? "border-emerald-500/50 bg-slate-950/40 hover:border-emerald-300 hover:bg-slate-900/70"
                  : "border-emerald-200 bg-white hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-200/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-wide ${labLabelClass}`}>
                    {addon.package.lab_name || addon.package.lab_code.toUpperCase()}
                  </p>
                  <p className={`text-sm font-semibold ${nameClass}`}>
                    {addon.package.name}
                  </p>
                  <p className={`mt-1 text-xs ${replacesClass}`}>
                    Replaces: {coversLabel || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-[11px] uppercase tracking-wide ${upgradeLabelClass}`}>
                    Upgrade cost
                  </p>
                  <p className={`text-lg font-semibold ${upgradeValueClass}`}>
                    {addon.upgradeCostLabel}
                  </p>
                </div>
              </div>
              <div className={`rounded-lg border p-3 text-xs ${addsBoxClass}`}>
                <p className="font-semibold uppercase tracking-wide">Adds</p>
                <p>{addsLabel}</p>
              </div>
              <div className={`mt-auto text-xs ${totalLabelClass}`}>
                Estimated total after upgrade:{" "}
                <span className={`font-semibold ${totalValueClass}`}>
                  {addon.estimatedTotalLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
