import { ArrowDownRight, Boxes, CircleAlert, Sparkles } from "lucide-react";

import type { OptimizationViewModel } from "./view-model";

interface KeyInsightsProps {
  viewModel: OptimizationViewModel;
}

export function KeyInsights({ viewModel }: KeyInsightsProps) {
  const { isDark, counts, bonusBiomarkers, pricing } = viewModel;
  const packagesCount = counts.packages;
  const singlesCount = counts.singles;
  const bonusCount = bonusBiomarkers.length;
  const onSaleCount = counts.onSale;

  return (
    <div
      className={`rounded-3xl border p-6 shadow-xl ${
        isDark ? "border-slate-800 bg-slate-900/80 shadow-black/30" : "border-slate-200 bg-white"
      }`}
    >
      <h3
        className={`text-lg font-semibold ${
          isDark ? "text-white" : "text-slate-900"
        }`}
      >
        Key insights
      </h3>
      <ul
        className={`mt-4 space-y-4 text-sm ${
          isDark ? "text-slate-300" : "text-slate-600"
        }`}
      >
        <li className="flex items-start gap-3">
          <span
            className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
              isDark ? "bg-sky-500/20 text-sky-200" : "bg-sky-500/10 text-sky-500"
            }`}
          >
            <Boxes className="h-3.5 w-3.5" />
          </span>
          <div>
            <p
              className={`font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              Composition
            </p>
            <p>
              {packagesCount} package{packagesCount === 1 ? "" : "s"} and {singlesCount} single
              test{singlesCount === 1 ? "" : "s"} balance cost and coverage.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span
            className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
              isDark ? "bg-emerald-500/20 text-emerald-200" : "bg-emerald-500/10 text-emerald-500"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p
              className={`font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              Bonus biomarkers
            </p>
            <p>
              {bonusCount > 0
                ? `${bonusCount} additional biomarker${bonusCount === 1 ? "" : "s"} unlocked beyond your selection.`
                : "No extra biomarkers this time—every item is laser-focused."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span
            className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
              isDark ? "bg-amber-500/20 text-amber-300" : "bg-amber-500/10 text-amber-600"
            }`}
          >
            <ArrowDownRight className="h-3.5 w-3.5" />
          </span>
          <div>
            <p
              className={`font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              Savings opportunity
            </p>
            <p>
              {pricing.highlightSavings
                ? `${pricing.potentialSavingsLabel} cheaper prices appeared within the last 30 days.`
                : "You are already buying at the historic low for this basket."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span
            className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
              isDark ? "bg-rose-500/20 text-rose-200" : "bg-rose-500/10 text-rose-500"
            }`}
          >
            <CircleAlert className="h-3.5 w-3.5" />
          </span>
          <div>
            <p
              className={`font-semibold ${
                isDark ? "text-slate-100" : "text-slate-800"
              }`}
            >
              Promotions
            </p>
            <p>
              {onSaleCount > 0
                ? `${onSaleCount} item${onSaleCount === 1 ? " is" : "s are"} on sale right now.`
                : "No active promotions on the chosen items."}
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}
