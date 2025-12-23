"use client";

import { Gift, PiggyBank } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { OptimizationViewModel } from "./view-model";
import { PriceRangeSparkline } from "./price-range-sparkline";

interface SummaryStat {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
  /** Optional: use success styling when condition is positive */
  isPositive?: boolean;
}

interface SummaryStatsGridProps {
  viewModel: OptimizationViewModel;
}

export function SummaryStatsGrid({ viewModel }: SummaryStatsGridProps) {
  const t = useTranslations();
  const { isDark, totalNowGrosz, totalMin30Grosz } = viewModel;
  const summaryStats = buildSummaryStats(viewModel, t);

  return (
    <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-3">
      {summaryStats.map((stat) => (
        <div
          key={stat.label}
          className={`flex h-full flex-col rounded-2xl border px-4 py-5 shadow-sm ${
            isDark
              ? "border-slate-800 bg-slate-950/60 text-slate-100 shadow-black/20"
              : "border-slate-100 bg-slate-50 text-slate-900"
          }`}
        >
          <div
            className={`flex items-center gap-3 text-sm ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                isDark ? stat.accentDark : stat.accentLight
              }`}
            >
              {stat.icon}
            </span>
            <span
              className={`font-semibold uppercase tracking-wide text-[11px] ${
                isDark ? "text-slate-200" : ""
              }`}
            >
              {stat.label}
            </span>
          </div>
          <div className="mt-4 flex flex-1 flex-col justify-between">
            <p
              className={`text-2xl font-semibold ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {stat.value}
            </p>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{stat.hint}</p>
          </div>
        </div>
      ))}

      {/* Price Range Sparkline Card */}
      <div
        className={`flex h-full flex-col rounded-2xl border px-4 py-5 shadow-sm ${
          isDark
            ? "border-slate-800 bg-slate-950/60 text-slate-100 shadow-black/20"
            : "border-slate-100 bg-slate-50 text-slate-900"
        }`}
      >
        <PriceRangeSparkline
          currentPrice={totalNowGrosz}
          minPrice={totalMin30Grosz}
          isDark={isDark}
        />
      </div>
    </div>
  );
}

function buildSummaryStats(
  viewModel: OptimizationViewModel,
  t: ReturnType<typeof useTranslations>,
): SummaryStat[] {
  const { pricing, bonusPricing, bonusBiomarkers } = viewModel;

  const atFloor = !pricing.highlightSavings;
  const hasBonus = bonusBiomarkers.length > 0;

  return [
    {
      label: t("optimization.potentialSavings"),
      value: atFloor ? "—" : pricing.potentialSavingsLabel,
      hint: atFloor
        ? t("optimization.bestPrice")
        : t("optimization.premiumOverFloor"),
      icon: <PiggyBank className="h-4 w-4" />,
      accentLight: atFloor
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-amber-500/10 text-amber-600",
      accentDark: atFloor
        ? "bg-emerald-500/20 text-emerald-200"
        : "bg-amber-500/20 text-amber-200",
      isPositive: atFloor,
    },
    {
      label: t("optimization.bonusValue"),
      value: hasBonus ? bonusPricing.totalNowLabel : "—",
      hint: hasBonus
        ? t("optimization.extraBiomarkersIncluded", {
            count: bonusBiomarkers.length,
          })
        : t("optimization.noExtraBiomarkers"),
      icon: <Gift className="h-4 w-4" />,
      accentLight: hasBonus
        ? "bg-violet-500/10 text-violet-600"
        : "bg-slate-500/10 text-slate-500",
      accentDark: hasBonus
        ? "bg-violet-500/20 text-violet-200"
        : "bg-slate-500/20 text-slate-400",
      isPositive: hasBonus,
    },
  ];
}
