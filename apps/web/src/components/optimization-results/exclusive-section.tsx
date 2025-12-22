"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OptimizationViewModel } from "./view-model";

interface ExclusiveSectionProps {
  viewModel: OptimizationViewModel;
}

export function ExclusiveSection({ viewModel }: ExclusiveSectionProps) {
  const t = useTranslations();
  const { exclusive, isDark } = viewModel;
  const [isExpanded, setIsExpanded] = useState(true);

  if (exclusive.biomarkers.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-6 rounded-xl border p-4 ${
        isDark ? "border-amber-500/40 bg-amber-500/10" : "border-amber-200 bg-amber-50"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
          <CircleAlert className="h-4 w-4" />
          <span>{t("optimization.exclusiveToLab", { lab: exclusive.labTitle })}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              isDark ? "bg-amber-500/20 text-amber-200" : "bg-amber-100 text-amber-700"
            }`}
          >
            {exclusive.biomarkers.length}
          </span>
        </div>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
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
          isExpanded ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <ul className="flex flex-wrap gap-2 text-xs">
          {exclusive.biomarkers.map((biomarker) => (
            <li
              key={biomarker.code}
              className={`rounded-full px-3 py-1 ${
                isDark ? "bg-amber-500/20 text-amber-100" : "bg-amber-100 text-amber-700"
              }`}
            >
              {biomarker.displayName}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
