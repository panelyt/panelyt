"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OptimizationViewModel } from "./view-model";
import { OverlapSection } from "./overlap-section";
import { SummaryStatsGrid } from "./summary-stats";

interface SummarySectionProps {
  viewModel: OptimizationViewModel;
}

export function SummarySection({ viewModel }: SummarySectionProps) {
  const t = useTranslations();
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
            {t("optimization.optimizationSummaryTitle")}
          </h2>
          <p
            className={`mt-2 max-w-2xl text-sm ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {t("optimization.optimizationSummaryDescription", {
              count: selected.length,
            })}
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
              {t("optimization.bonusBiomarkersSummary", {
                count: bonusBiomarkers.length,
                total: bonusPricing.totalNowLabel,
              })}
            </span>
          </span>
        )}
      </div>

      <SummaryStatsGrid viewModel={viewModel} />

      <OverlapSection viewModel={viewModel} />
    </section>
  );
}
