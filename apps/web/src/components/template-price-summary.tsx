"use client";

import { Loader2 } from "lucide-react";

import { useOptimization } from "../hooks/useOptimization";
import { formatCurrency } from "../lib/format";

interface TemplatePriceSummaryProps {
  codes: string[];
}

export function TemplatePriceSummary({ codes }: TemplatePriceSummaryProps) {
  const optimization = useOptimization(codes, 'auto');
  const hasCodes = codes.length > 0;

  if (!hasCodes) {
    return null;
  }

  if (optimization.isLoading) {
    return (
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Pricing…
        </span>
      </div>
    );
  }

  if (optimization.isError || !optimization.data) {
    return (
      <div className="flex justify-end">
        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-200">
          Pricing unavailable
        </span>
      </div>
    );
  }

  const totals = optimization.data;
  const currentTotal = formatCurrency(totals.total_now);

  return (
    <div className="flex justify-end">
      <span
        className="text-right text-2xl font-semibold text-white md:text-3xl"
        aria-label={`Template current price ${currentTotal}`}
      >
        {currentTotal}
      </span>
    </div>
  );
}
