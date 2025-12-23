"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OptimizationViewModel } from "./view-model";

interface OverlapSectionProps {
  viewModel: OptimizationViewModel;
}

export function OverlapSection({ viewModel }: OverlapSectionProps) {
  const t = useTranslations();
  const { overlaps, isDark } = viewModel;
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default

  if (overlaps.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-6 rounded-xl border p-4 ${
        isDark ? "border-amber-400/40 bg-amber-500/10" : "border-amber-200 bg-amber-50"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex flex-col gap-1 text-left sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <Layers className={`h-4 w-4 ${isDark ? "text-amber-200" : "text-amber-600"}`} />
            <h3
              className={`text-sm font-semibold ${
                isDark ? "text-amber-200" : "text-amber-700"
              }`}
            >
              {t("optimization.packageOverlaps")}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100 text-amber-700"
              }`}
            >
              {overlaps.length}
            </span>
          </div>
          <p className={`text-xs ${isDark ? "text-amber-100/70" : "text-amber-600/70"}`}>
            {isExpanded
              ? t("optimization.packageOverlapsExpanded")
              : t("optimization.packageOverlapsCollapsed")}
          </p>
        </div>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            isDark
              ? "bg-amber-500/20 text-amber-200"
              : "bg-amber-100 text-amber-600"
          }`}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? "mt-4 max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <ul className="space-y-3">
        {overlaps.map((entry) => (
          <li
            key={entry.code}
            className={`rounded-lg border p-3 ${
              isDark
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                : "border-amber-200 bg-white text-amber-800"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isDark
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {entry.displayName}
                </span>
                <span
                  className={`text-[11px] uppercase tracking-wide ${
                    isDark ? "text-amber-200/70" : "text-amber-600/70"
                  }`}
                >
                  {t("optimization.packagesCount", {
                    count: entry.packages.length,
                  })}
                </span>
              </div>
            </div>
            <div className={`mt-2 flex flex-wrap gap-2 text-xs ${isDark ? "text-amber-100" : "text-amber-700"}`}>
              {entry.packages.map((itemName) => (
                <span
                  key={itemName}
                  className={`rounded-full px-3 py-1 ${
                    isDark
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {itemName}
                </span>
              ))}
            </div>
          </li>
        ))}
        </ul>
      </div>
    </div>
  );
}
