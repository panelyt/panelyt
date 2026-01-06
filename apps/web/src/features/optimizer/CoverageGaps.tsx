"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

interface CoverageGapsProps {
  uncovered: string[];
  displayNameFor: (code: string) => string;
  onRemove?: (code: string) => void;
  onSearchAlternative?: (code: string) => void;
}

export function CoverageGaps({
  uncovered,
  displayNameFor,
  onRemove,
  onSearchAlternative,
}: CoverageGapsProps) {
  const t = useTranslations();

  if (uncovered.length === 0) {
    return null;
  }

  return (
    <Card className="p-5">
      <div>
        <h3 className="text-lg font-semibold text-primary">
          {t("optimization.coverageGapsTitle")}
        </h3>
        <p className="mt-1 text-sm text-secondary">
          {t("optimization.coverageGapsSummary", { count: uncovered.length })}
        </p>
      </div>

      <ul className="mt-4 space-y-3">
        {uncovered.map((code) => (
          <li
            key={code}
            className="rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-primary">
                  {displayNameFor(code)}
                </span>
                <span className="font-mono text-xs text-secondary">{code}</span>
              </div>
              {(onRemove || onSearchAlternative) && (
                <div className="flex flex-wrap items-center gap-2">
                  {onSearchAlternative && (
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => onSearchAlternative(code)}
                    >
                      {t("optimization.searchAlternatives")}
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={() => onRemove(code)}
                    >
                      {t("optimization.removeFromPanel")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
