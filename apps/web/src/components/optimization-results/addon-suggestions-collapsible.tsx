"use client";

import { useState } from "react";
import type { OptimizeResponse } from "@panelyt/types";
import { ChevronDown, ChevronUp, Plus, Sparkles, Loader2 } from "lucide-react";

import { formatCurrency } from "../../lib/format";

interface AddonSuggestionsCollapsibleProps {
  suggestions?: OptimizeResponse["addon_suggestions"];
  isLoading?: boolean;
  onApply?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
  isDark?: boolean;
}

export function AddonSuggestionsCollapsible({
  suggestions = [],
  isLoading = false,
  onApply,
  isDark = true,
}: AddonSuggestionsCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't render if no suggestions and not loading
  if (!isLoading && (!suggestions || suggestions.length === 0)) {
    return null;
  }

  // Calculate summary for collapsed state
  const totalAddCount = suggestions.reduce(
    (sum, s) => sum + (s.adds?.length ?? 0),
    0
  );
  const lowestCost = suggestions.reduce(
    (min, s) => Math.min(min, s.upgrade_cost ?? Infinity),
    Infinity
  );
  const summaryText =
    totalAddCount > 0 && lowestCost < Infinity
      ? `${totalAddCount} biomarker${totalAddCount === 1 ? "" : "s"} for +${formatCurrency(lowestCost)}`
      : "Loading...";

  const handleApply = (suggestion: OptimizeResponse["addon_suggestions"][number]) => {
    if (!onApply) return;
    const additions = (suggestion.adds ?? []).map((entry) => ({
      code: entry.code,
      name: entry.display_name,
    }));
    onApply(additions, suggestion.package.name);
  };

  return (
    <div
      className={`rounded-2xl border transition ${
        isDark
          ? "border-slate-800 bg-slate-900/60"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              isDark
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-emerald-100 text-emerald-600"
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </span>
          <div className="flex flex-col">
            <span
              className={`text-sm font-semibold ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              Add more for less
            </span>
            <span
              className={`text-xs ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {isLoading ? "Looking for suggestions..." : summaryText}
            </span>
          </div>
        </div>

        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full transition ${
            isDark
              ? "bg-slate-800 text-slate-400 hover:text-slate-200"
              : "bg-slate-200 text-slate-500 hover:text-slate-700"
          }`}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-3 px-4 pb-4">
          {suggestions.map((suggestion) => (
            <button
              key={`addon-${suggestion.package.id}`}
              type="button"
              onClick={() => handleApply(suggestion)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                isDark
                  ? "border-slate-700 bg-slate-800/60 hover:border-emerald-400/40 hover:bg-slate-800"
                  : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      isDark ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {suggestion.package.name}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      isDark ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {suggestion.adds && suggestion.adds.length > 0
                      ? `Adds ${suggestion.adds.length} biomarker${suggestion.adds.length === 1 ? "" : "s"}`
                      : "Package upgrade"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(suggestion.adds ?? []).map((biomarker) => (
                      <span
                        key={`add-${biomarker.code}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isDark
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        {biomarker.display_name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-semibold ${
                      isDark ? "text-emerald-300" : "text-emerald-600"
                    }`}
                  >
                    +{formatCurrency(suggestion.upgrade_cost)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
