"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

type SegmentedOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

interface SegmentedControlProps {
  value: string;
  options: SegmentedOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

function SegmentedControl({
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
}: SegmentedControlProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-pill border border-border/70 bg-surface-1 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-ring",
              isActive
                ? "bg-accent-cyan text-slate-950"
                : "text-secondary hover:bg-surface-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export type { SegmentedControlProps, SegmentedOption };
