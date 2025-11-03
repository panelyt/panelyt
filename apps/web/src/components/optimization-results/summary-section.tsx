import { Sparkles } from "lucide-react";

import type { LabChoiceCard } from "./types";
import type { OptimizationViewModel } from "./view-model";
import { CoverageSection } from "./coverage-section";
import { AddOnSuggestionsSection } from "./add-on-section";
import { ExclusiveSection } from "./exclusive-section";
import { LabCardGrid } from "./lab-card-grid";
import { OverlapSection } from "./overlap-section";
import { SummaryStatsGrid } from "./summary-stats";

interface SummarySectionProps {
  viewModel: OptimizationViewModel;
  labCards: LabChoiceCard[];
  onAddBiomarkers?: (biomarkers: Array<{ code: string; name: string }>) => void;
}

export function SummarySection({ viewModel, labCards, onAddBiomarkers }: SummarySectionProps) {
  const { isDark, selected, bonusBiomarkers, bonusPricing } = viewModel;

  return (
    <section
      className={`rounded-3xl border p-6 ${
        isDark
          ? "border-slate-800 bg-slate-900/80 shadow-2xl shadow-black/40"
          : "border-slate-200 bg-white shadow-2xl shadow-slate-900/10"
      }`}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            className={`text-2xl font-semibold ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            Optimization summary
          </h2>
          <p
            className={`mt-2 max-w-2xl text-sm ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            Covering {selected.length} biomarker{selected.length === 1 ? "" : "s"} with the most
            cost-efficient mix available right now. Compare current pricing against the recent
            30-day floor to understand potential savings.
          </p>
        </div>
        {bonusBiomarkers.length > 0 && (
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              isDark
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            <Sparkles className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">
              {`${bonusBiomarkers.length} bonus biomarker${
                bonusBiomarkers.length === 1 ? "" : "s"
              } (${bonusPricing.totalNowLabel})`}
            </span>
          </span>
        )}
      </div>

      <AddOnSuggestionsSection viewModel={viewModel} onAdd={onAddBiomarkers} />

      <SummaryStatsGrid viewModel={viewModel} />

      <LabCardGrid labCards={labCards} isDark={isDark} />

      <CoverageSection viewModel={viewModel} />

      <ExclusiveSection viewModel={viewModel} />

      <OverlapSection viewModel={viewModel} />
    </section>
  );
}
