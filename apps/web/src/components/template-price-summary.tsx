"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { formatCurrency } from "../lib/format";
import type { TemplatePricingState } from "../hooks/useBiomarkerListTemplates";

interface TemplatePriceSummaryProps {
  pricing?: TemplatePricingState;
  className?: string;
}

export function TemplatePriceSummary({ pricing, className }: TemplatePriceSummaryProps) {
  const t = useTranslations();

  if (!pricing || pricing.status === "idle") {
    return (
      <div className="flex justify-end">
        <span className="text-xs text-secondary">{t("common.notAvailable")}</span>
      </div>
    );
  }

  if (pricing.status === "loading") {
    return (
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-pill border border-border/80 bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("collections.pricingLoading")}
        </span>
      </div>
    );
  }

  if (pricing.status === "error" || typeof pricing.totalNow !== "number") {
    return (
      <div className="flex justify-end">
        <span className="rounded-pill border border-accent-red/40 bg-accent-red/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-red">
          {t("collections.pricingUnavailable")}
        </span>
      </div>
    );
  }

  const currentTotal = formatCurrency(pricing.totalNow);

  return (
    <div className="flex justify-end">
      <span
        className={`text-right font-semibold text-primary ${className ?? "text-lg"}`}
        aria-label={t("collections.currentTotalAria", { amount: currentTotal })}
      >
        {currentTotal}
      </span>
    </div>
  );
}
