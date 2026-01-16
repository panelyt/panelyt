"use client";

import { useId, useState, useEffect } from "react";
import type { OptimizeResponse } from "@panelyt/types";
import { ChevronDown, ChevronUp, Plus, Sparkles, Loader2, Flame } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatCurrency } from "../../lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";

const STORAGE_KEY = "panelyt:addons-expanded";

const readExpansionState = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const persistExpansionState = (value: boolean) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors (e.g., private mode restrictions).
  }
};

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
  const t = useTranslations();
  const [isExpanded, setIsExpanded] = useState(readExpansionState);
  const contentId = useId();

  useEffect(() => {
    persistExpansionState(isExpanded);
  }, [isExpanded]);

  // Don't render if no suggestions and not loading
  if (!isLoading && (!suggestions || suggestions.length === 0)) {
    return null;
  }

  // Calculate summary for collapsed state - show the cheapest single addon
  const cheapestAddon = suggestions.reduce<OptimizeResponse["addon_suggestions"][number] | null>(
    (best, s) => {
      if (best === null) return s;
      return (s.upgrade_cost ?? Infinity) < (best.upgrade_cost ?? Infinity) ? s : best;
    },
    null
  );
  const addonCount = cheapestAddon?.adds?.length ?? 0;
  const addonCost = cheapestAddon?.upgrade_cost ?? Infinity;
  const summaryText =
    addonCount > 0 && addonCost < Infinity
      ? t("optimization.biomarkersForPrice", {
          count: addonCount,
          price: formatCurrency(addonCost),
        })
      : t("common.loading");

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
      className={`rounded-2xl border p-4 transition ${
        isDark
          ? "border-slate-800 bg-slate-900/60"
          : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left transition ${
          isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-100"
        }`}
        aria-expanded={isExpanded}
        aria-controls={contentId}
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
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
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
              {t("optimization.addMoreForLess")}
            </span>
            <span
              className={`text-xs ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {isLoading ? t("optimization.lookingForSuggestions") : summaryText}
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
        id={contentId}
        className={`overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none ${
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-3 pt-3">
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
                      ? t("optimization.addsBiomarkers", {
                          count: suggestion.adds.length,
                        })
                      : t("optimization.packageUpgrade")}
                  </p>
                  <TooltipProvider delayDuration={200}>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(suggestion.covers ?? []).map((biomarker) => (
                        <Tooltip key={`cover-${biomarker.code}`}>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isDark
                                  ? "bg-surface-1 text-secondary"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {biomarker.display_name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("optimization.addonPillTooltipCovered")}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {(suggestion.adds ?? []).map((biomarker) => (
                        <Tooltip key={`add-${biomarker.code}`}>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isDark
                                  ? "bg-emerald-500/20 text-emerald-200"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              {biomarker.display_name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("optimization.addonPillTooltipAdds")}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {(suggestion.removes ?? []).map((biomarker) => (
                        <Tooltip key={`remove-${biomarker.code}`}>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isDark
                                  ? "bg-rose-500/20 text-rose-200"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              <Flame className="h-2.5 w-2.5" />
                              {biomarker.display_name}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("optimization.addonPillTooltipRemoves")}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </TooltipProvider>
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
