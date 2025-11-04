"use client";

import { useMemo } from "react";
import type { OptimizeResponse } from "@panelyt/types";
import { CircleAlert, Loader2 } from "lucide-react";

import { useBiomarkerLookup } from "../../hooks/useBiomarkerLookup";
import type { LabChoiceCard } from "./types";
import { PriceBreakdownSection } from "./price-breakdown";
import { SummarySection } from "./summary-section";
import { buildOptimizationViewModel } from "./view-model";

export interface OptimizationResultsProps {
  selected: string[];
  result?: OptimizeResponse;
  isLoading: boolean;
  error?: Error | null;
  variant?: "light" | "dark";
  labCards?: LabChoiceCard[];
  onApplyAddon?: (biomarkers: { code: string; name: string }[], packageName: string) => void;
}

export function OptimizationResults({
  selected,
  result,
  isLoading,
  error,
  variant = "light",
  labCards = [],
  onApplyAddon,
}: OptimizationResultsProps) {
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
        Start by adding biomarkers above. Panelyt will run the solver instantly and suggest the
        cheapest combination of single tests and packages, highlighting any bonus biomarkers you pick
        up along the way.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Crunching the optimal basket…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
        <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-semibold">Optimization failed</p>
          <p className="text-xs text-red-200/80">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!viewModel) {
    return null;
  }

  return (
    <div className="space-y-8">
      <SummarySection
        viewModel={viewModel}
        labCards={labCards}
        onApplyAddon={onApplyAddon}
      />
      <PriceBreakdownSection viewModel={viewModel} />
    </div>
  );
}

export type { LabChoiceCard };
