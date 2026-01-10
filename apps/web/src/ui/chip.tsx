import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-xs font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-border/70 bg-surface-2 text-secondary",
        selected: "border-accent-cyan/60 bg-accent-cyan/10 text-accent-cyan",
        bonus: "border-accent-emerald/60 bg-accent-emerald/10 text-accent-emerald",
        warn: "border-accent-amber/60 bg-accent-amber/10 text-accent-amber",
      },
      tone: {
        mono: "font-mono",
        sans: "font-sans",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "mono",
    },
  },
);

type ChipProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof chipVariants>;

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, variant, tone, ...props }, ref) => (
    <span ref={ref} className={cn(chipVariants({ variant, tone }), className)} {...props} />
  ),
);

Chip.displayName = "Chip";

export { Chip, chipVariants };
export type { ChipProps };
