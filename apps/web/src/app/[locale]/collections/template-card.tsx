"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ApplyTemplateSplitButton } from "@/components/apply-template-split-button";
import { TemplateBiomarkerChips } from "@/components/template-biomarker-chips";
import { TemplatePriceSummary } from "@/components/template-price-summary";
import type { TemplatePricingState } from "@/hooks/useBiomarkerListTemplates";
import { cn } from "@/lib/cn";
import {
  formatExactTimestamp,
  formatRelativeTimestamp,
  resolveTimestamp,
} from "@/lib/dates";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui/tooltip";

type TemplateCardData = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  biomarkers: Array<{ code: string; display_name: string }>;
};

interface TemplateCardProps {
  template: TemplateCardData;
  pricing?: TemplatePricingState;
  onAddToPanel: () => void;
  onReplacePanel: () => void;
  onViewDetails: () => void;
  isAdmin?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function TemplateCard({
  template,
  pricing,
  onAddToPanel,
  onReplacePanel,
  onViewDetails,
  isAdmin = false,
  onEdit,
  onDelete,
  className,
}: TemplateCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
    [locale],
  );
  const exactTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const updatedLabels = useMemo(() => {
    const resolved = resolveTimestamp(template.updated_at);
    if (!resolved) {
      return { relative: template.updated_at, exact: null };
    }
    return {
      relative: formatRelativeTimestamp(resolved.timestamp, relativeTimeFormatter),
      exact: formatExactTimestamp(resolved.date, exactTimeFormatter),
    };
  }, [exactTimeFormatter, relativeTimeFormatter, template.updated_at]);

  return (
    <Card className={cn("p-5 transition hover:border-border/90", className)}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-primary md:text-lg">
                {template.name}
              </h3>
              {!template.is_active ? (
                <span className="rounded-pill border border-border/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                  {t("collections.unpublished")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
              <span className="rounded-pill border border-border/70 bg-surface-2 px-2 py-0 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                {t("common.biomarkersCount", { count: template.biomarkers.length })}
              </span>
              <span aria-hidden="true">·</span>
              <TooltipProvider delayDuration={0}>
                {updatedLabels.exact ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default underline decoration-dotted decoration-border/70 underline-offset-2">
                        {t("collections.updatedLabel", { date: updatedLabels.relative })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{updatedLabels.exact}</TooltipContent>
                  </Tooltip>
                ) : (
                  <span>
                    {t("collections.updatedLabel", { date: updatedLabels.relative })}
                  </span>
                )}
              </TooltipProvider>
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-secondary">
            {template.description ?? t("collections.noDescription")}
          </p>
          <TemplateBiomarkerChips biomarkers={template.biomarkers} />
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end md:text-right">
          <TemplatePriceSummary pricing={pricing} className="text-lg" />
          <ApplyTemplateSplitButton
            onAddToPanel={onAddToPanel}
            onReplacePanel={onReplacePanel}
            onViewDetails={onViewDetails}
            isAdmin={isAdmin}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </Card>
  );
}

function TemplateCardSkeleton() {
  return (
    <Card className="p-5" data-testid="template-card-skeleton">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-20 rounded-pill" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-3 w-24 rounded-pill" />
              <Skeleton className="h-3 w-28 rounded-pill" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-5/6 max-w-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-pill" />
            <Skeleton className="h-6 w-20 rounded-pill" />
            <Skeleton className="h-6 w-14 rounded-pill" />
            <Skeleton className="h-6 w-24 rounded-pill" />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end md:text-right">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-9 w-36 rounded-pill" />
        </div>
      </div>
    </Card>
  );
}

export type { TemplateCardProps, TemplateCardData };
export { TemplateCardSkeleton };
