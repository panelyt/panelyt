import { ArrowDownRight, Boxes, Layers3 } from "lucide-react";
import type { ReactNode } from "react";

import type { OptimizationViewModel } from "./view-model";

interface SummaryStat {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
}

interface SummaryStatsGridProps {
  viewModel: OptimizationViewModel;
}

export function SummaryStatsGrid({ viewModel }: SummaryStatsGridProps) {
  const { isDark } = viewModel;
  const summaryStats = buildSummaryStats(viewModel);

  return (
    <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
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
    </div>
  );
}

function buildSummaryStats(viewModel: OptimizationViewModel): SummaryStat[] {
  const { pricing, counts } = viewModel;

  return [
    {
      label: "30-day minimum",
      value: pricing.totalMin30Label,
      hint: "Lowest basket seen this month",
      icon: <Layers3 className="h-4 w-4" />,
      accentLight: "bg-indigo-500/10 text-indigo-500",
      accentDark: "bg-indigo-500/20 text-indigo-200",
    },
    {
      label: pricing.highlightSavings ? "Potential savings" : "Locked price",
      value: pricing.highlightSavings ? pricing.potentialSavingsLabel : "At the floor",
      hint: pricing.highlightSavings ? "Seen within the last 30 days" : "Matches historic low",
      icon: <ArrowDownRight className="h-4 w-4" />,
      accentLight: pricing.highlightSavings
        ? "bg-emerald-500/10 text-emerald-500"
        : "bg-slate-500/10 text-slate-500",
      accentDark: pricing.highlightSavings
        ? "bg-emerald-500/20 text-emerald-200"
        : "bg-slate-500/20 text-slate-300",
    },
    {
      label: "Items in basket",
      value: `${counts.items}`,
      hint: `${counts.packages} packages · ${counts.singles} singles`,
      icon: <Boxes className="h-4 w-4" />,
      accentLight: "bg-violet-500/10 text-violet-500",
      accentDark: "bg-violet-500/20 text-violet-200",
    },
  ];
}
