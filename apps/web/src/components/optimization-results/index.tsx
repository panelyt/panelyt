"use client";

import { useMemo } from "react";
import type { OptimizeResponse } from "@panelyt/types";
import { CircleAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useBiomarkerLookup } from "../../hooks/useBiomarkerLookup";
import type { LabChoiceCard } from "./types";
import { PriceBreakdownSection } from "./price-breakdown";
import { LabTabs } from "./lab-tabs";
import { AddonSuggestionsCollapsible } from "./addon-suggestions-collapsible";
import { buildOptimizationViewModel } from "./view-model";
import { CoverageGaps } from "../../features/optimizer/CoverageGaps";

export interface OptimizationResultsProps {
  selected: string[];
  result?: OptimizeResponse;
  isLoading: boolean;
  error?: Error | null;
  variant?: "light" | "dark";
  labCards?: LabChoiceCard[];
  addonSuggestions?: OptimizeResponse["addon_suggestions"];
  addonSuggestionsLoading?: boolean;
  onApplyAddon?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
  onRemoveFromPanel?: (code: string) => void;
  onSearchAlternative?: (code: string) => void;
}

export function OptimizationResults({
  selected,
  result,
  isLoading,
  error,
  variant = "light",
  labCards = [],
  addonSuggestions = [],
  addonSuggestionsLoading = false,
  onApplyAddon,
  onRemoveFromPanel,
  onSearchAlternative,
}: OptimizationResultsProps) {
  const t = useTranslations();
  const missingCodes = useMemo(() => {
    if (!result) {
      return [] as string[];
    }
    const labels = result.labels ?? {};
    const uniqueCodes = Array.from(
      new Set(result.items.flatMap((item) => item.biomarkers)),
    );
    return uniqueCodes.filter((code) => !(code in labels));
  }, [result]);

  const { data: biomarkerNames } = useBiomarkerLookup(missingCodes);
  const biomarkerLabels = useMemo(() => biomarkerNames ?? {}, [biomarkerNames]);

  const viewModel = useMemo(
    () =>
      result
        ? buildOptimizationViewModel({
            selected,
            result,
            variant,
            biomarkerNames: biomarkerLabels,
          })
        : null,
    [selected, result, variant, biomarkerLabels],
  );

  if (selected.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/70 p-8 text-sm text-slate-200">
        {t("results.emptyState")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("results.optimizing")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
        <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-semibold">{t("results.optimizationFailed")}</p>
          <p className="text-xs text-red-200/80">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!viewModel) {
    return null;
  }

  return (
    <div className="space-y-6">
      <LabTabs labCards={labCards} isDark={viewModel.isDark} />
      <AddonSuggestionsCollapsible
        suggestions={addonSuggestions}
        isLoading={addonSuggestionsLoading}
        onApply={onApplyAddon}
        isDark={viewModel.isDark}
      />
      <CoverageGaps
        uncovered={viewModel.coverage.uncoveredTokens}
        displayNameFor={viewModel.displayNameFor}
        onRemove={onRemoveFromPanel}
        onSearchAlternative={onSearchAlternative}
      />
      <PriceBreakdownSection viewModel={viewModel} />
    </div>
  );
}

export type { LabChoiceCard };
