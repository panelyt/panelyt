import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface PriceRangeSparklineProps {
  currentPrice: number;
  minPrice: number;
  isDark?: boolean;
}

/**
 * A visual sparkline showing where the current price sits relative to the 30-day minimum.
 * Provides an at-a-glance understanding of potential savings.
 */
export function PriceRangeSparkline({
  currentPrice,
  minPrice,
  isDark = true,
}: PriceRangeSparklineProps) {
  const atFloor = currentPrice <= minPrice;
  const premium = atFloor ? 0 : ((currentPrice - minPrice) / minPrice) * 100;

  // Clamp premium percentage for visual display (max 50% above floor shown)
  const clampedPremium = Math.min(premium, 50);

  // Calculate position: 0% = at floor, 100% = 50% above floor
  const positionPercent = atFloor ? 0 : (clampedPremium / 50) * 100;

  // Generate sparkline bars to simulate price history variation
  // This creates a visual representation of the price range
  const barCount = 20;
  const bars = generateSparklineBars(barCount, positionPercent, atFloor);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-medium uppercase tracking-wide ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Price position
        </span>
        <PriceStatusBadge premium={premium} atFloor={atFloor} isDark={isDark} />
      </div>

      <div className="relative">
        {/* Sparkline visualization */}
        <div className="flex h-8 items-end gap-[2px]">
          {bars.map((height, index) => (
            <SparklineBar
              key={index}
              height={height}
              isHighlight={index === Math.floor(positionPercent / (100 / barCount))}
              isDark={isDark}
              atFloor={atFloor}
            />
          ))}
        </div>

        {/* Floor indicator line */}
        <div
          className={`absolute left-0 right-0 border-t border-dashed ${
            isDark ? "border-emerald-400/40" : "border-emerald-500/40"
          }`}
          style={{ bottom: "20%" }}
        />

        {/* Labels */}
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className={isDark ? "text-emerald-300" : "text-emerald-600"}>
            30-day floor
          </span>
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>
            {atFloor ? "At the best price" : `+${premium.toFixed(1)}% above floor`}
          </span>
        </div>
      </div>
    </div>
  );
}

function SparklineBar({
  height,
  isHighlight,
  isDark,
  atFloor,
}: {
  height: number;
  isHighlight: boolean;
  isDark: boolean;
  atFloor: boolean;
}) {
  const baseColor = atFloor
    ? isDark
      ? "bg-emerald-400"
      : "bg-emerald-500"
    : isDark
      ? "bg-slate-600"
      : "bg-slate-300";

  const highlightColor = atFloor
    ? isDark
      ? "bg-emerald-300"
      : "bg-emerald-400"
    : isDark
      ? "bg-sky-400"
      : "bg-sky-500";

  return (
    <div
      className={`flex-1 rounded-sm transition-all duration-300 ${
        isHighlight ? highlightColor : baseColor
      } ${isHighlight ? "opacity-100" : "opacity-60"}`}
      style={{ height: `${Math.max(height, 15)}%` }}
    />
  );
}

function PriceStatusBadge({
  premium,
  atFloor,
  isDark,
}: {
  premium: number;
  atFloor: boolean;
  isDark: boolean;
}) {
  if (atFloor) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        <Minus className="h-3 w-3" />
        At floor
      </span>
    );
  }

  if (premium <= 5) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-emerald-100 text-emerald-700"
        }`}
      >
        <TrendingDown className="h-3 w-3" />
        Near floor
      </span>
    );
  }

  if (premium <= 15) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isDark
            ? "bg-amber-500/20 text-amber-200"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        <TrendingUp className="h-3 w-3" />
        Moderate
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isDark
          ? "bg-rose-500/20 text-rose-200"
          : "bg-rose-100 text-rose-700"
      }`}
    >
      <TrendingUp className="h-3 w-3" />
      Above avg
    </span>
  );
}

/**
 * Generate sparkline bar heights that simulate price variation
 * with the current position highlighted.
 */
function generateSparklineBars(
  count: number,
  positionPercent: number,
  atFloor: boolean
): number[] {
  const bars: number[] = [];
  const floorHeight = 20; // Minimum height representing floor price
  const currentIndex = Math.floor(positionPercent / (100 / count));

  for (let i = 0; i < count; i++) {
    if (atFloor) {
      // At floor: show mostly flat bars at floor level with slight variation
      const variation = Math.sin(i * 0.8) * 10 + Math.random() * 5;
      bars.push(floorHeight + Math.max(0, variation));
    } else {
      // Above floor: create a wave pattern showing price has varied
      // with current position being higher
      const baseHeight = floorHeight;
      const distanceFromCurrent = Math.abs(i - currentIndex);
      const proximity = 1 - distanceFromCurrent / count;

      // Create natural-looking variation
      const wave = Math.sin(i * 0.5) * 15;
      const noise = (Math.random() - 0.5) * 10;

      // Bars closer to current position are taller
      const heightBoost = proximity * (positionPercent * 0.6);

      bars.push(Math.min(100, Math.max(baseHeight, baseHeight + wave + noise + heightBoost)));
    }
  }

  return bars;
}
