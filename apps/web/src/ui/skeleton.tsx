import * as React from "react";

import { cn } from "@/lib/cn";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      role="presentation"
      aria-hidden="true"
      className={cn("relative overflow-hidden rounded-lg bg-surface-2/80", className)}
    >
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  ),
);

Skeleton.displayName = "Skeleton";

export { Skeleton };
export type { SkeletonProps };
