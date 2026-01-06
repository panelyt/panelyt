"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { usePanelStore } from "@/stores/panelStore";

export type PanelPillProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

type StatusTone = "covered" | "gaps" | "pending";

const statusConfig: Record<StatusTone, { icon: React.ReactNode; className: string }> = {
  covered: {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    className: "text-emerald-300",
  },
  gaps: {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    className: "text-amber-300",
  },
  pending: {
    icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
    className: "text-slate-300",
  },
};

export const PanelPill = React.forwardRef<HTMLButtonElement, PanelPillProps>(
  ({ className, type = "button", ...props }, ref) => {
    const t = useTranslations();
    const selectedCount = usePanelStore((state) => state.selected.length);
    const summary = usePanelStore((state) => state.lastOptimizationSummary);

    const hasSelection = selectedCount > 0;
    const hasSummary = Boolean(summary) && hasSelection;

    const status: StatusTone = hasSummary
      ? summary!.uncoveredCount > 0
        ? "gaps"
        : "covered"
      : "pending";

    const statusLabel =
      status === "covered"
        ? t("panelTray.statusCovered")
        : status === "gaps"
          ? t("panelTray.statusGaps")
          : t("panelTray.statusPending");

    const statusStyles = statusConfig[status];
    const countLabel = t("common.biomarkersCount", { count: selectedCount });
    const summaryLabel = hasSummary
      ? formatCurrency(summary!.totalNow)
      : t("panelTray.runOptimize");

    return (
      <button
        ref={ref}
        type={type}
        aria-label={t("panelTray.openPanel")}
        className={cn(
          "inline-flex items-center gap-3 rounded-full border border-border/80 bg-surface-1/90 px-4 py-2 text-xs text-primary transition hover:border-emerald-400/60 hover:bg-surface-2 focus-ring",
          className,
        )}
        {...props}
      >
        <span className="flex items-center gap-2">
          <span role="img" aria-label={statusLabel} className={statusStyles.className}>
            {statusStyles.icon}
          </span>
          <span className="font-semibold">{countLabel}</span>
        </span>
        <span className="text-xs text-secondary">{summaryLabel}</span>
      </button>
    );
  },
);

PanelPill.displayName = "PanelPill";
