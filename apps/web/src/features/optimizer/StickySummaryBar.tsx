import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Card } from "@/ui/card";

interface StickySummaryBarProps {
  isVisible: boolean;
  isLoading?: boolean;
  source?: ReactNode;
  total?: ReactNode;
  savings?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const Placeholder = ({
  className,
  isLoading,
}: {
  className?: string;
  isLoading?: boolean;
}) => (
  <div
    aria-hidden="true"
    className={cn(
      "h-4 rounded-full bg-surface-2/70",
      isLoading ? "animate-pulse" : null,
      className,
    )}
  />
);

export function StickySummaryBar({
  isVisible,
  isLoading = false,
  source,
  total,
  savings,
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
          <div data-slot="source">
            {source ?? <Placeholder className="w-32" isLoading={isLoading} />}
          </div>
          <div data-slot="total">
            {total ?? <Placeholder className="w-24" isLoading={isLoading} />}
          </div>
          <div data-slot="savings">
            {savings ?? <Placeholder className="w-28" isLoading={isLoading} />}
          </div>
        </div>
        <div data-slot="actions" className="flex items-center gap-2">
          {actions ?? (
            <>
              <Placeholder className="h-9 w-20" isLoading={isLoading} />
              <Placeholder className="h-9 w-20" isLoading={isLoading} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
