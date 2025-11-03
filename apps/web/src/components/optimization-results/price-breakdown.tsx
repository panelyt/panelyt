import { Sparkles } from "lucide-react";

import { formatGroszToPln } from "../../lib/format";

import type { OptimizationViewModel } from "./view-model";

interface PriceBreakdownSectionProps {
  viewModel: OptimizationViewModel;
}

export function PriceBreakdownSection({ viewModel }: PriceBreakdownSectionProps) {
  const {
    isDark,
    variant,
    groups,
    selectedSet,
    displayNameFor,
    totalNowGrosz,
    totalMin30Grosz,
  } = viewModel;

  return (
    <section
      className={`rounded-3xl border p-6 shadow-xl ${
        isDark ? "border-slate-800 bg-slate-900/80 shadow-black/30" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-1">
        <h3
          className={`text-lg font-semibold ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          Price breakdown
        </h3>
        <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-500"}`}>
          Each bar shows the current price against the best price observed in the last month.
        </p>
      </div>
      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <div key={group.kind} className="space-y-3">
            <div
              className={`flex items-center justify-between text-xs uppercase tracking-wide ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              <span>
                {group.kind === "package" ? "Packages" : "Single tests"} · {group.items.length}{" "}
                item{group.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-3">
              {group.items.length === 0 ? (
                <p
                  className={`rounded-xl border border-dashed px-4 py-3 text-sm ${
                    isDark
                      ? "border-slate-700 bg-slate-900/60 text-slate-400"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  No {group.kind === "package" ? "packages" : "single tests"} selected in the optimal
                  basket.
                </p>
              ) : (
                group.items.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-4 transition ${
                      isDark
                        ? "border-slate-800 bg-slate-900/60 hover:border-emerald-400/40 hover:bg-slate-900"
                        : "border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50/60"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-sm font-semibold ${
                            isDark
                              ? "text-slate-100 hover:text-emerald-300"
                              : "text-slate-900 hover:text-emerald-600"
                          }`}
                        >
                          {item.name}
                        </a>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                          {item.biomarkers.map((biomarker) => {
                            const isBonus = !selectedSet.has(biomarker);
                            const displayName = displayNameFor(biomarker);
                            return (
                              <span
                                key={biomarker}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                                  isBonus
                                    ? isDark
                                      ? "bg-emerald-500/20 text-emerald-200"
                                      : "bg-emerald-200/70 text-emerald-900"
                                    : isDark
                                      ? "bg-slate-800 text-slate-300"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                                title={`${displayName} (${biomarker})${
                                  isBonus ? " · Bonus coverage" : ""
                                }`}
                              >
                                {displayName}
                                {isBonus && <Sparkles className="h-3 w-3" />}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div
                        className={`text-right text-xs ${
                          isDark ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        <p className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                          Current
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            isDark ? "text-white" : "text-slate-900"
                          }`}
                        >
                          {formatGroszToPln(item.price_now_grosz)}
                        </p>
                        <p
                          className={`mt-2 font-semibold ${
                            isDark ? "text-emerald-300" : "text-emerald-600"
                          }`}
                        >
                          30-day min
                        </p>
                        <p>{formatGroszToPln(item.price_min30_grosz)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <PriceComparisonBar
                        now={item.price_now_grosz}
                        min={item.price_min30_grosz}
                        totalNow={totalNowGrosz}
                        totalMin={totalMin30Grosz}
                        variant={variant}
                      />
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PriceComparisonBar({
  now,
  min,
  totalNow,
  totalMin,
  variant = "light",
}: {
  now: number;
  min: number;
  totalNow: number;
  totalMin: number;
  variant?: "light" | "dark";
}) {
  const baselineNow = totalNow > 0 ? totalNow : now || 1;
  const nowWidth = Math.min(100, Math.round((now / baselineNow) * 100));
  const minWidth = totalMin > 0 ? Math.min(100, Math.round((min / totalMin) * 100)) : 0;
  const isDark = variant === "dark";

  return (
    <div
      className={`relative h-1.5 rounded-full ${
        isDark ? "bg-slate-800" : "bg-slate-200"
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${
          isDark ? "bg-emerald-400/80" : "bg-emerald-300"
        }`}
        style={{ width: `${minWidth}%` }}
      />
      <div
        className="relative h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500"
        style={{ width: `${nowWidth}%` }}
      />
    </div>
  );
}
