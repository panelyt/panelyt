import { TrendingDown, TrendingUp, Check } from "lucide-react";
import type { ReactNode } from "react";

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
  const atFloor = currentPrice <= minPrice;
  const savingsGrosz = Math.max(0, currentPrice - minPrice);
  const savingsPercent = minPrice > 0 ? (savingsGrosz / minPrice) * 100 : 0;

  // For the gauge, cap at 30% above floor for visual scaling
  const gaugePercent = Math.min(savingsPercent, 30);
  const gaugePosition = (gaugePercent / 30) * 100;

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
          Price position
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
            {atFloor ? "At floor" : `+${formatGroszToPln(savingsGrosz)}`}
          </p>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {atFloor
              ? "Matching the 30-day low"
              : `${savingsPercent.toFixed(1)}% above the floor`}
          </p>
        </div>

        {/* Compact gauge visualization */}
        <div className="mt-3">
          <PriceGauge position={gaugePosition} atFloor={atFloor} isDark={isDark} />
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

function PriceGauge({
  position,
  atFloor,
  isDark,
}: {
  position: number;
  atFloor: boolean;
  isDark: boolean;
}) {
  return (
    <div
      className={`relative h-1.5 overflow-hidden rounded-full ${
        isDark ? "bg-slate-800" : "bg-slate-200"
      }`}
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "linear-gradient(to right, rgba(52, 211, 153, 0.4), rgba(251, 191, 36, 0.3), rgba(239, 68, 68, 0.3))"
            : "linear-gradient(to right, rgba(167, 243, 208, 1), rgba(254, 243, 199, 1), rgba(254, 202, 202, 1))",
        }}
      />

      {/* Position marker */}
      <div
        className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full shadow-sm transition-all duration-500"
        style={{
          left: `${Math.max(1, Math.min(position, 99))}%`,
          backgroundColor: atFloor
            ? isDark
              ? "#34d399"
              : "#10b981"
            : position < 33
              ? isDark
                ? "#34d399"
                : "#10b981"
              : position < 66
                ? isDark
                  ? "#fbbf24"
                  : "#f59e0b"
                : isDark
                  ? "#f87171"
                  : "#ef4444",
        }}
      />
    </div>
  );
}
