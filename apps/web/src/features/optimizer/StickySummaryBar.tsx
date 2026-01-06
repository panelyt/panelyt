import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Card } from "@/ui/card";

interface StickySummaryBarProps {
  isVisible: boolean;
  bestLab?: ReactNode;
  total?: ReactNode;
  coverage?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const Placeholder = ({ className }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={cn("h-4 rounded-full bg-surface-2/70", className)}
  />
);

export function StickySummaryBar({
  isVisible,
  bestLab,
  total,
  coverage,
  actions,
  className,
}: StickySummaryBarProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <Card
      variant="surface"
      data-testid="sticky-summary-bar"
      className={cn(
        "sticky top-24 z-20 border-border/60 bg-surface-1/90 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <div data-slot="best-lab">
            {bestLab ?? <Placeholder className="w-32" />}
          </div>
          <div data-slot="total">
            {total ?? <Placeholder className="w-24" />}
          </div>
          <div data-slot="coverage">
            {coverage ?? <Placeholder className="w-28" />}
          </div>
        </div>
        <div data-slot="actions" className="flex items-center gap-2">
          {actions ?? (
            <>
              <Placeholder className="h-9 w-20" />
              <Placeholder className="h-9 w-20" />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
