"use client";

import type { OptimizeResponse } from "@panelyt/types";
import {
  ArrowDownRight,
  Boxes,
  CircleAlert,
  CircleCheck,
  Layers3,
  Loader2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

import { useBiomarkerLookup } from "../hooks/useBiomarkerLookup";
import { formatCurrency, formatGroszToPln } from "../lib/format";

interface Props {
  selected: string[];
  result?: OptimizeResponse;
  isLoading: boolean;
  error?: Error | null;
  variant?: "light" | "dark";
  showInsights?: boolean;
  showExplainability?: boolean;
}

export function OptimizationResults({
  selected,
  result,
  isLoading,
  error,
  variant = "light",
  showInsights = true,
  showExplainability = true,
}: Props) {
  const isDark = variant === "dark";
  const allBiomarkerCodes = result?.items.flatMap((item) => item.biomarkers) ?? [];
  const uniqueCodes = Array.from(new Set(allBiomarkerCodes));
  const { data: biomarkerNames } = useBiomarkerLookup(uniqueCodes);

  if (selected.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/70 p-8 text-sm text-slate-200">
        Start by adding biomarkers above. Panelyt will run the solver instantly and suggest the
        cheapest combination of single tests and packages, highlighting any bonus biomarkers you
        pick up along the way.
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

  if (!result) {
    return null;
  }

  const groups = groupByKind(result.items);
  const selectedSet = new Set(selected);
  const uncoveredTokens = result.uncovered;
  const coveredTokens = selected.filter((token) => !uncoveredTokens.includes(token));
  const coveragePercent = selected.length
    ? Math.round((coveredTokens.length / selected.length) * 100)
    : 0;
  const potentialSavingsRaw = Math.max(result.total_now - result.total_min30, 0);
  const potentialSavings = potentialSavingsRaw > 0 ? formatCurrency(potentialSavingsRaw) : "—";
  const highlightSavings = potentialSavingsRaw > 0.01;
  const maxPrice = Math.max(...result.items.map((item) => item.price_now_grosz), 1);
  const bonusBiomarkers = uniqueCodes.filter((code) => !selectedSet.has(code));
  const onSaleCount = result.items.filter((item) => item.on_sale).length;
  const packagesCount = groups.find((group) => group.kind === "package")?.items.length ?? 0;
  const singlesCount = groups.find((group) => group.kind === "single")?.items.length ?? 0;
  const explainEntries = Object.entries(result.explain).sort((a, b) => a[0].localeCompare(b[0]));

  const summaryStats = [
    {
      label: "Current total",
      value: formatCurrency(result.total_now),
      hint: "Live prices from diag.pl",
      icon: <ShoppingCart className="h-4 w-4" />,
      accentLight: "bg-sky-500/10 text-sky-500",
      accentDark: "bg-sky-500/20 text-sky-200",
    },
    {
      label: "30-day minimum",
      value: formatCurrency(result.total_min30),
      hint: "Lowest basket seen this month",
      icon: <Layers3 className="h-4 w-4" />,
      accentLight: "bg-indigo-500/10 text-indigo-500",
      accentDark: "bg-indigo-500/20 text-indigo-200",
    },
    {
      label: highlightSavings ? "Potential savings" : "Locked price",
      value: highlightSavings ? potentialSavings : "At the floor",
      hint: highlightSavings ? "Seen within the last 30 days" : "Matches historic low",
      icon: <ArrowDownRight className="h-4 w-4" />,
      accentLight: highlightSavings
        ? "bg-emerald-500/10 text-emerald-500"
        : "bg-slate-500/10 text-slate-500",
      accentDark: highlightSavings
        ? "bg-emerald-500/20 text-emerald-200"
        : "bg-slate-500/20 text-slate-300",
    },
    {
      label: "Items in basket",
      value: `${result.items.length}`,
      hint: `${packagesCount} packages · ${singlesCount} singles`,
      icon: <Boxes className="h-4 w-4" />,
      accentLight: "bg-violet-500/10 text-violet-500",
      accentDark: "bg-violet-500/20 text-violet-200",
    },
  ];

  return (
    <div className="space-y-8">
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
            <div
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                isDark
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-emerald-500/10 text-emerald-600"
              }`}
            >
              <Sparkles className="mr-2 inline h-4 w-4" /> {bonusBiomarkers.length} bonus
              biomarker{bonusBiomarkers.length === 1 ? "" : "s"} included
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryStats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl border px-4 py-5 shadow-sm ${
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
              <p
                className={`mt-4 text-2xl font-semibold ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                {stat.value}
              </p>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {stat.hint}
              </p>
            </div>
          ))}
        </div>

        <div
          className={`mt-8 rounded-xl border p-4 ${
            isDark
              ? "border-slate-800 bg-slate-950/70"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                isDark ? "text-slate-200" : "text-slate-700"
              }`}
            >
              <CircleCheck className="h-4 w-4 text-emerald-500" />
              Coverage
            </div>
            <p
              className={`text-xs uppercase tracking-wide ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`}
            >
              {coveredTokens.length} covered · {selected.length - coveredTokens.length} uncovered
            </p>
          </div>
          <div
            className={`mt-3 h-2 rounded-full ${
              isDark ? "bg-slate-800" : "bg-slate-200"
            }`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          {uncoveredTokens.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {uncoveredTokens.map((token) => (
                <span
                  key={token}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                    isDark
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                  {token}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <div
        className={`grid gap-6 ${
          showInsights || showExplainability
            ? "xl:grid-cols-[minmax(0,_3fr)_minmax(0,_2fr)]"
            : ""
        }`}
      >
        <section
          className={`rounded-3xl border p-6 shadow-xl ${
            isDark
              ? "border-slate-800 bg-slate-900/80 shadow-black/30"
              : "border-slate-200 bg-white"
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
                      No {group.kind === "package" ? "packages" : "single tests"} selected in the
                      optimal basket.
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
                                const displayName = biomarkerNames?.[biomarker] ?? biomarker;
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
                                    title={`${displayName} (${biomarker})${isBonus ? " · Bonus coverage" : ""}`}
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
                            max={maxPrice}
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

        {(showInsights || showExplainability) && (
          <section className="space-y-6">
            {showInsights && (
              <div
                className={`rounded-3xl border p-6 shadow-xl ${
                  isDark
                    ? "border-slate-800 bg-slate-900/80 shadow-black/30"
                    : "border-slate-200 bg-white"
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
                        isDark
                          ? "bg-sky-500/20 text-sky-200"
                          : "bg-sky-500/10 text-sky-500"
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
                      <p>{packagesCount} package{packagesCount === 1 ? "" : "s"} and {singlesCount} single test{singlesCount === 1 ? "" : "s"} balance cost and coverage.</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isDark
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-emerald-500/10 text-emerald-500"
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
                      <p>{bonusBiomarkers.length > 0 ? `${bonusBiomarkers.length} additional biomarker${bonusBiomarkers.length === 1 ? "" : "s"} unlocked beyond your selection.` : "No extra biomarkers this time—every item is laser-focused."}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isDark
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-amber-500/10 text-amber-600"
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
                      <p>{highlightSavings ? `${potentialSavings} cheaper prices appeared within the last 30 days.` : "You are already buying at the historic low for this basket."}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      className={`mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        isDark
                          ? "bg-rose-500/20 text-rose-200"
                          : "bg-rose-500/10 text-rose-500"
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
                      <p>{onSaleCount > 0 ? `${onSaleCount} item${onSaleCount === 1 ? " is" : "s are"} on sale right now.` : "No active promotions on the chosen items."}</p>
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {showExplainability && (
              <div
                className={`rounded-3xl border p-6 shadow-xl ${
                  isDark
                    ? "border-slate-800 bg-slate-900/80 shadow-black/30"
                    : "border-slate-200 bg-white"
                }`}
              >
                <h3
                  className={`text-lg font-semibold ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  Coverage explainability
                </h3>
                <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Understand which items satisfy each biomarker requirement.
                </p>
                <div className="mt-4 space-y-3">
                  {explainEntries.map(([token, items]) => {
                    const display = biomarkerNames?.[token] ?? token;
                    const isCovered = !uncoveredTokens.includes(token);
                    return (
                      <div
                        key={token}
                        className={`rounded-2xl border p-3 ${
                          isDark
                            ? "border-slate-800 bg-slate-900/60"
                            : "border-slate-100 bg-slate-50"
                        }`}
                      >
                        <div
                          className={`flex flex-wrap items-center justify-between gap-2 text-sm ${
                            isDark ? "text-slate-300" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isCovered
                                ? isDark
                                  ? "bg-emerald-500/20 text-emerald-200"
                                  : "bg-emerald-200/70 text-emerald-900"
                                : isDark
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-amber-200/80 text-amber-800"
                            }`}>
                              {display}
                            </span>
                            {!isCovered && (
                              <span
                                className={`text-xs uppercase tracking-wide ${
                                  isDark ? "text-amber-300" : "text-amber-600"
                                }`}
                              >
                                Missing
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[11px] uppercase tracking-wide ${
                              isDark ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {items.length} item{items.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div
                          className={`mt-2 flex flex-wrap gap-2 text-xs ${
                            isDark ? "text-slate-300" : "text-slate-600"
                          }`}
                        >
                          {items.map((itemName) => (
                            <span
                              key={itemName}
                              className={`rounded-full px-3 py-1 shadow-sm ${
                                isDark ? "bg-slate-800" : "bg-white"
                              }`}
                            >
                              {itemName}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function PriceComparisonBar({
  now,
  min,
  max,
  variant = "light",
}: {
  now: number;
  min: number;
  max: number;
  variant?: "light" | "dark";
}) {
  const nowWidth = Math.min(100, Math.round((now / max) * 100));
  const minWidth = Math.min(100, Math.round((min / max) * 100));
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

function groupByKind(items: OptimizeResponse["items"]) {
  const packages: OptimizeResponse["items"] = [];
  const singles: OptimizeResponse["items"] = [];
  for (const item of items) {
    if (item.kind === "package") {
      packages.push(item);
    } else {
      singles.push(item);
    }
  }
  const sortByPrice = (a: OptimizeResponse["items"][number], b: OptimizeResponse["items"][number]) =>
    b.price_now_grosz - a.price_now_grosz;
  packages.sort(sortByPrice);
  singles.sort(sortByPrice);
  return [
    { kind: "package" as const, items: packages },
    { kind: "single" as const, items: singles },
  ];
}
