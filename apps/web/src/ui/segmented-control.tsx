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
  unstyled?: boolean;
}

function SegmentedControl({
  value,
  options,
  onValueChange,
  ariaLabel,
  className,
  unstyled = false,
}: SegmentedControlProps) {
  const containerClasses = unstyled
    ? "inline-flex"
    : "inline-flex rounded-pill border border-border/70 bg-surface-1 p-1";
  const buttonBaseClasses = unstyled
    ? "transition focus-ring"
    : "h-9 rounded-pill px-3 text-xs font-semibold uppercase tracking-wide transition focus-ring";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(containerClasses, className)}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const buttonStateClasses = unstyled
          ? ""
          : isActive
            ? "bg-accent-cyan text-slate-950"
            : "text-secondary hover:bg-surface-2";
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(buttonBaseClasses, buttonStateClasses)}
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
