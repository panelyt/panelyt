import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      leading,
      trailing,
      clearable = false,
      onClear,
      clearLabel = "Clear input",
      value,
      onChange,
      disabled,
      ...props
    },
    ref,
  ) => {
    const hasValue = Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && String(value).length > 0;
    const showClear = clearable && hasValue && !disabled;
    const rightSlotCount = Number(Boolean(trailing)) + Number(showClear);
    const paddingLeft = leading ? "pl-10" : "pl-3";
    const paddingRight =
      rightSlotCount === 0 ? "pr-3" : rightSlotCount === 1 ? "pr-10" : "pr-16";

    const handleClear = () => {
      if (disabled) {
        return;
      }
      onClear?.();
      if (onChange) {
        onChange({
          target: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    return (
      <div className="relative w-full">
        {leading ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">
            {leading}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            "h-10 w-full rounded-lg border border-border/80 bg-surface-2 text-sm text-primary placeholder:text-secondary focus-ring disabled:cursor-not-allowed disabled:opacity-60",
            paddingLeft,
            paddingRight,
            className,
          )}
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...props}
        />
        {rightSlotCount > 0 ? (
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {showClear ? (
              <button
                type="button"
                aria-label={clearLabel}
                onClick={handleClear}
                className="rounded-md p-1 text-secondary transition hover:text-primary focus-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {trailing ? <span className="flex items-center">{trailing}</span> : null}
          </div>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
export type { InputProps };
