"use client";

import { TrendingDown, TrendingUp, Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { formatGroszToPln } from "../../lib/format";

interface PriceRangeSparklineProps {
  currentPrice: number;
  minPrice: number;
  isDark?: boolean;
}

/**
 * A card showing the price position relative to the 30-day floor.
 * Designed to match the layout of other summary stat cards.
 */
export function PriceRangeSparkline({
  currentPrice,
  minPrice,
  isDark = true,
}: PriceRangeSparklineProps) {
  const t = useTranslations();
  const atFloor = currentPrice <= minPrice;
  const savingsGrosz = Math.max(0, currentPrice - minPrice);
  const savingsPercent = minPrice > 0 ? (savingsGrosz / minPrice) * 100 : 0;

  // Determine accent colors and icon based on status
  const { icon, accentLight, accentDark } = getStatusStyle(atFloor, savingsPercent);

  return (
    <div className="flex h-full flex-col">
      {/* Header - matches other cards */}
      <div
        className={`flex items-center gap-3 text-sm ${
          isDark ? "text-slate-400" : "text-slate-500"
        }`}
      >
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            isDark ? accentDark : accentLight
          }`}
        >
          {icon}
        </span>
        <span
          className={`font-semibold uppercase tracking-wide text-[11px] ${
            isDark ? "text-slate-200" : ""
          }`}
        >
          {t("optimization.pricePosition")}
        </span>
      </div>

      {/* Content - matches other cards */}
      <div className="mt-4 flex flex-1 flex-col justify-between">
        <div>
          <p
            className={`text-2xl font-semibold ${
              atFloor
                ? isDark
                  ? "text-emerald-300"
                  : "text-emerald-600"
                : isDark
                  ? "text-white"
                  : "text-slate-900"
            }`}
          >
            {atFloor ? t("optimization.atFloor") : `+${formatGroszToPln(savingsGrosz)}`}
          </p>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {atFloor
              ? t("optimization.matchingFloor")
              : t("optimization.percentAboveFloor", {
                  percent: savingsPercent.toFixed(1),
                })}
          </p>
        </div>

      </div>
    </div>
  );
}

function getStatusStyle(atFloor: boolean, savingsPercent: number): {
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
} {
  if (atFloor) {
    return {
      icon: <Check className="h-4 w-4" />,
      accentLight: "bg-emerald-500/10 text-emerald-500",
      accentDark: "bg-emerald-500/20 text-emerald-200",
    };
  }

  if (savingsPercent <= 10) {
    return {
      icon: <TrendingDown className="h-4 w-4" />,
      accentLight: "bg-emerald-500/10 text-emerald-500",
      accentDark: "bg-emerald-500/20 text-emerald-200",
    };
  }

  if (savingsPercent <= 20) {
    return {
      icon: <TrendingUp className="h-4 w-4" />,
      accentLight: "bg-amber-500/10 text-amber-500",
      accentDark: "bg-amber-500/20 text-amber-200",
    };
  }

  return {
    icon: <TrendingUp className="h-4 w-4" />,
    accentLight: "bg-rose-500/10 text-rose-500",
    accentDark: "bg-rose-500/20 text-rose-200",
  };
}
