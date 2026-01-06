"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatGroszToPln, formatCurrency } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Card } from "../../ui/card";

import type { OptimizationViewModel } from "./view-model";

interface PriceBreakdownSectionProps {
  viewModel: OptimizationViewModel;
}

export function PriceBreakdownSection({ viewModel }: PriceBreakdownSectionProps) {
  const t = useTranslations();
  const {
    isDark,
    variant,
    groups,
    selectedSet,
    displayNameFor,
    totalNowGrosz,
    totalMin30Grosz,
    counts,
    result,
    pricing,
    overlaps,
  } = viewModel;

  const [isHighlighting, setIsHighlighting] = useState(false);
  const previousTotalRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const previousTotal = previousTotalRef.current;
    if (previousTotal === null) {
      previousTotalRef.current = result.total_now;
      return;
    }

    if (previousTotal !== result.total_now) {
      previousTotalRef.current = result.total_now;
      setIsHighlighting(true);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setIsHighlighting(false);
      }, 200);
    }

    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [result.total_now]);

  // Create a map of biomarker code -> other packages it appears in
  const overlapMap = new Map<string, string[]>();
  for (const overlap of overlaps) {
    overlapMap.set(overlap.code, overlap.packages);
  }

  // Get lab name from result
  const labName = result.lab_name || result.lab_code.toUpperCase();

  return (
    <Card
      className={cn(
        "p-5",
        isDark ? "border-border/70 bg-surface-1" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2
            className={`text-lg font-semibold ${
              isDark ? "text-primary" : "text-slate-900"
            }`}
          >
            {t("optimization.orderFrom", { lab: labName })}
          </h2>
          <p
            className={`mt-1 text-sm ${
              isDark ? "text-secondary" : "text-slate-500"
            }`}
          >
            {t("optimization.itemsCount", { count: counts.items })}
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-6">
        {groups.map((group) => {
          const groupLabel =
            group.kind === "package"
              ? t("optimization.packages")
              : t("optimization.singleTests");

          return (
          <div key={group.kind} className="space-y-3">
            <div
              className={`flex items-center justify-between text-xs uppercase tracking-wide ${
                isDark ? "text-secondary" : "text-slate-400"
              }`}
            >
              <span>
                {groupLabel} · {t("optimization.itemsCount", { count: group.items.length })}
              </span>
            </div>
            <div className="space-y-3">
              {group.items.length === 0 ? (
                <p
                  className={`rounded-xl border border-dashed px-4 py-3 text-sm ${
                    isDark
                      ? "border-border/70 bg-surface-2/40 text-secondary"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  {group.kind === "package"
                    ? t("optimization.noPackagesSelected")
                    : t("optimization.noSinglesSelected")}
                </p>
              ) : (
                group.items.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-4 transition ${
                      isDark
                        ? "border-border/70 bg-surface-2/40 hover:border-accent-emerald/40 hover:bg-surface-2"
                        : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
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
                              ? "text-primary hover:text-accent-emerald"
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
                                      ? "bg-surface-1 text-secondary"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                                title={`${displayName} (${biomarker})${
                                  isBonus ? ` · ${t("optimization.bonusCoverage")}` : ""
                                }`}
                              >
                                {displayName}
                                {isBonus && <Sparkles className="h-3 w-3" />}
                              </span>
                            );
                          })}
                        </div>
                        {/* Overlap notes */}
                        {item.biomarkers.some((b) => {
                          const otherPackages = overlapMap.get(b);
                          return otherPackages && otherPackages.some((p) => p !== item.name);
                        }) && (
                          <div
                            className={`mt-2 flex items-center gap-1.5 text-xs ${
                              isDark ? "text-amber-300/80" : "text-amber-600/80"
                            }`}
                          >
                            <Layers className="h-3 w-3" />
                            <span>
                              {(() => {
                                const overlappingBiomarkers = item.biomarkers.filter((b) => {
                                  const otherPackages = overlapMap.get(b);
                                  return otherPackages && otherPackages.some((p) => p !== item.name);
                                });
                                if (overlappingBiomarkers.length === 0) return null;
                                const firstBiomarker = overlappingBiomarkers[0];
                                const otherPackages = overlapMap.get(firstBiomarker) ?? [];
                                const otherPackage = otherPackages.find((p) => p !== item.name);
                                if (!otherPackage) {
                                  return null;
                                }
                                return t("optimization.alsoInPackage", {
                                  biomarker: displayNameFor(firstBiomarker),
                                  package: otherPackage,
                                });
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-right text-xs ${
                          isDark ? "text-secondary" : "text-slate-500"
                        }`}
                      >
                        <p
                          className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}
                        >
                          {t("optimization.currentLabel")}
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            isDark ? "text-primary" : "text-slate-900"
                          }`}
                        >
                          {formatGroszToPln(item.price_now_grosz)}
                        </p>
                        <p
                          className={`mt-2 font-semibold ${
                            isDark ? "text-emerald-300" : "text-emerald-600"
                        }`}
                      >
                        {t("optimization.min30Label")}
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
          );
        })}
      </div>

      {/* Total and savings footer */}
      <div
        data-testid="price-breakdown-total"
        className={cn(
          "mt-6 rounded-xl border-t pt-4 transition-colors duration-200 motion-reduce:transition-none",
          isDark ? "border-border/70" : "border-slate-200",
          isHighlighting && "bg-accent-cyan/10 ring-1 ring-accent-cyan/40 shadow-selected",
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-semibold uppercase tracking-wide ${
              isDark ? "text-secondary" : "text-slate-500"
            }`}
          >
            {t("optimization.totalLabel")}
          </span>
          <span
            className={`text-2xl font-semibold ${
              isDark ? "text-primary" : "text-slate-900"
            }`}
          >
            {formatCurrency(result.total_now)}
          </span>
        </div>
        {pricing.highlightSavings && (
          <p
            className={`mt-1 text-right text-sm ${
              isDark ? "text-emerald-300" : "text-emerald-600"
            }`}
          >
            {t("optimization.savingVsFloor", {
              amount: pricing.potentialSavingsLabel,
            })}
          </p>
        )}
      </div>
    </Card>
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
  const safeTotalNow = Math.max(totalNow, 1);
  const safeTotalMin = Math.max(totalMin, 1);
  const nowWidth = Math.min(100, Math.round((now / safeTotalNow) * 100));
  const minWidth = Math.min(100, Math.round((min / safeTotalMin) * 100));
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
