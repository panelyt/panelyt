import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface OptimizerLayoutProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

export function OptimizerLayout({ left, right, className }: OptimizerLayoutProps) {
  return (
    <div
      className={cn("grid gap-8 xl:grid-cols-[2fr_3fr]", className)}
      data-testid="optimizer-layout"
    >
      <div className="flex flex-col gap-6" data-slot="left">
        {left}
      </div>
      <div className="flex flex-col gap-6" data-slot="right">
        {right}
      </div>
    </div>
  );
}
