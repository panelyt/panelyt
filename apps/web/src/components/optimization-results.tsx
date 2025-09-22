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
}

export function OptimizationResults({ selected, result, isLoading, error }: Props) {
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
      accent: "bg-sky-500/10 text-sky-500",
    },
    {
      label: "30-day minimum",
      value: formatCurrency(result.total_min30),
      hint: "Lowest basket seen this month",
      icon: <Layers3 className="h-4 w-4" />,
      accent: "bg-indigo-500/10 text-indigo-500",
    },
    {
      label: highlightSavings ? "Potential savings" : "Locked price",
      value: highlightSavings ? potentialSavings : "At the floor",
      hint: highlightSavings ? "Seen within the last 30 days" : "Matches historic low",
      icon: <ArrowDownRight className="h-4 w-4" />,
      accent: highlightSavings ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500",
    },
    {
      label: "Items in basket",
      value: `${result.items.length}`,
      hint: `${packagesCount} packages · ${singlesCount} singles`,
      icon: <Boxes className="h-4 w-4" />,
      accent: "bg-violet-500/10 text-violet-500",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Optimization summary</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Covering {selected.length} biomarker{selected.length === 1 ? "" : "s"} with the most
              cost-efficient mix available right now. Compare current pricing against the recent
              30-day floor to understand potential savings.
            </p>
          </div>
          {bonusBiomarkers.length > 0 && (
            <div className="rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-600">
              <Sparkles className="mr-2 inline h-4 w-4" /> {bonusBiomarkers.length} bonus
              biomarker{bonusBiomarkers.length === 1 ? "" : "s"} included
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-5 text-slate-900 shadow-sm"
            >
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${stat.accent}`}>
                  {stat.icon}
                </span>
                <span className="font-semibold uppercase tracking-wide text-[11px]">
                  {stat.label}
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CircleCheck className="h-4 w-4 text-emerald-500" />
              Coverage
            </div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {coveredTokens.length} covered · {selected.length - coveredTokens.length} uncovered
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200">
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
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700"
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                  {token}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,_3fr)_minmax(0,_2fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-slate-900">Price breakdown</h3>
            <p className="text-sm text-slate-500">
              Each bar shows the current price against the best price observed in the last month.
            </p>
          </div>
          <div className="mt-6 space-y-6">
            {groups.map((group) => (
              <div key={group.kind} className="space-y-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                  <span>
                    {group.kind === "package" ? "Packages" : "Single tests"} · {group.items.length}{" "}
                    item{group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      No {group.kind === "package" ? "packages" : "single tests"} selected in the
                      optimal basket.
                    </p>
                  ) : (
                    group.items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/60"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-slate-900 hover:text-emerald-600"
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
                                        ? "bg-emerald-200/70 text-emerald-900"
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
                          <div className="text-right text-xs text-slate-500">
                            <p className="font-semibold text-slate-700">Current</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {formatGroszToPln(item.price_now_grosz)}
                            </p>
                            <p className="mt-2 font-semibold text-emerald-600">30-day min</p>
                            <p>{formatGroszToPln(item.price_min30_grosz)}</p>
                            {item.on_sale && (
                              <span className="mt-2 inline-flex items-center justify-end gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                                <Sparkles className="h-3 w-3" /> On sale
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3">
                          <PriceComparisonBar
                            now={item.price_now_grosz}
                            min={item.price_min30_grosz}
                            max={maxPrice}
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

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Key insights</h3>
            <ul className="mt-4 space-y-4 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/10 text-sky-500">
                  <Boxes className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">Composition</p>
                  <p>{packagesCount} package{packagesCount === 1 ? "" : "s"} and {singlesCount} single test{singlesCount === 1 ? "" : "s"} balance cost and coverage.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">Bonus biomarkers</p>
                  <p>{bonusBiomarkers.length > 0 ? `${bonusBiomarkers.length} additional biomarker${bonusBiomarkers.length === 1 ? "" : "s"} unlocked beyond your selection.` : "No extra biomarkers this time—every item is laser-focused."}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">Savings opportunity</p>
                  <p>{highlightSavings ? `${potentialSavings} cheaper prices appeared within the last 30 days.` : "You are already buying at the historic low for this basket."}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                  <CircleAlert className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">Promotions</p>
                  <p>{onSaleCount > 0 ? `${onSaleCount} item${onSaleCount === 1 ? " is" : "s are"} on sale right now.` : "No active promotions on the chosen items."}</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Coverage explainability</h3>
            <p className="mt-1 text-sm text-slate-500">
              Understand which items satisfy each biomarker requirement.
            </p>
            <div className="mt-4 space-y-3">
              {explainEntries.map(([token, items]) => {
                const display = biomarkerNames?.[token] ?? token;
                const isCovered = !uncoveredTokens.includes(token);
                return (
                  <div
                    key={token}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isCovered ? "bg-emerald-200/70 text-emerald-900" : "bg-amber-200/80 text-amber-800"
                        }`}>
                          {display}
                        </span>
                        {!isCovered && (
                          <span className="text-xs uppercase tracking-wide text-amber-600">Missing</span>
                        )}
                      </div>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">
                        {items.length} item{items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      {items.map((itemName) => (
                        <span
                          key={itemName}
                          className="rounded-full bg-white px-3 py-1 shadow-sm"
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
        </section>
      </div>
    </div>
  );
}

function PriceComparisonBar({
  now,
  min,
  max,
}: {
  now: number;
  min: number;
  max: number;
}) {
  const nowWidth = Math.min(100, Math.round((now / max) * 100));
  const minWidth = Math.min(100, Math.round((min / max) * 100));

  return (
    <div className="relative h-1.5 rounded-full bg-slate-200">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-emerald-300"
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
  return [
    { kind: "package" as const, items: packages },
    { kind: "single" as const, items: singles },
  ];
}
