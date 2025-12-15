import { formatGroszToPln } from "../../lib/format";

interface PriceRangeSparklineProps {
  currentPrice: number;
  minPrice: number;
  isDark?: boolean;
}

/**
 * A visual indicator showing potential savings - the difference between
 * current basket price and the 30-day floor price.
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-medium uppercase tracking-wide ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Price position
        </span>
        <StatusBadge atFloor={atFloor} savingsPercent={savingsPercent} isDark={isDark} />
      </div>

      {/* Main content */}
      <div className="mt-3 flex flex-1 flex-col justify-between">
        {atFloor ? (
          <AtFloorDisplay isDark={isDark} />
        ) : (
          <SavingsDisplay
            savingsGrosz={savingsGrosz}
            savingsPercent={savingsPercent}
            isDark={isDark}
          />
        )}

        {/* Gauge */}
        <div className="mt-3">
          <PriceGauge position={gaugePosition} atFloor={atFloor} isDark={isDark} />
          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className={isDark ? "text-emerald-300" : "text-emerald-600"}>
              Floor
            </span>
            <span className={isDark ? "text-slate-500" : "text-slate-400"}>
              +30%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AtFloorDisplay({ isDark }: { isDark: boolean }) {
  return (
    <div className="flex flex-col">
      <span
        className={`text-lg font-semibold ${
          isDark ? "text-emerald-300" : "text-emerald-600"
        }`}
      >
        Best price
      </span>
      <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        At 30-day floor
      </span>
    </div>
  );
}

function SavingsDisplay({
  savingsGrosz,
  savingsPercent,
  isDark,
}: {
  savingsGrosz: number;
  savingsPercent: number;
  isDark: boolean;
}) {
  const formattedSavings = formatGroszToPln(savingsGrosz);

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <span
          className={`text-lg font-semibold ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          {formattedSavings}
        </span>
        <span
          className={`text-xs ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          above floor
        </span>
      </div>
      <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
        {savingsPercent.toFixed(1)}% potential savings
      </span>
    </div>
  );
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
      className={`relative h-2 overflow-hidden rounded-full ${
        isDark ? "bg-slate-800" : "bg-slate-200"
      }`}
    >
      {/* Floor zone (green) */}
      <div
        className={`absolute inset-y-0 left-0 w-[10%] ${
          isDark ? "bg-emerald-500/40" : "bg-emerald-200"
        }`}
      />

      {/* Good zone gradient */}
      <div
        className="absolute inset-y-0 left-[10%] w-[30%]"
        style={{
          background: isDark
            ? "linear-gradient(to right, rgba(52, 211, 153, 0.3), rgba(251, 191, 36, 0.2))"
            : "linear-gradient(to right, rgba(167, 243, 208, 1), rgba(254, 243, 199, 1))",
        }}
      />

      {/* Warning zone gradient */}
      <div
        className="absolute inset-y-0 left-[40%] w-[60%]"
        style={{
          background: isDark
            ? "linear-gradient(to right, rgba(251, 191, 36, 0.2), rgba(239, 68, 68, 0.2))"
            : "linear-gradient(to right, rgba(254, 243, 199, 1), rgba(254, 202, 202, 1))",
        }}
      />

      {/* Position marker */}
      <div
        className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full shadow-sm transition-all duration-500"
        style={{
          left: `${Math.max(2, Math.min(position, 98))}%`,
          backgroundColor: atFloor
            ? isDark
              ? "#34d399"
              : "#10b981"
            : position < 33
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

function StatusBadge({
  atFloor,
  savingsPercent,
  isDark,
}: {
  atFloor: boolean;
  savingsPercent: number;
  isDark: boolean;
}) {
  if (atFloor) {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        Optimal
      </span>
    );
  }

  if (savingsPercent <= 5) {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        Good
      </span>
    );
  }

  if (savingsPercent <= 15) {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-amber-500/20 text-amber-200"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        Fair
      </span>
    );
  }

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isDark
          ? "bg-rose-500/20 text-rose-200"
          : "bg-rose-100 text-rose-700"
      }`}
    >
      High
    </span>
  );
}
