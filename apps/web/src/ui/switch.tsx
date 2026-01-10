import * as React from "react";

import { cn } from "@/lib/cn";

type SwitchProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label": string;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked, onCheckedChange, disabled, onClick, onKeyDown, ...props },
    ref,
  ) => {
    const suppressClickRef = React.useRef(false);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      onCheckedChange(!checked);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) {
        return;
      }
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }
      const isSpace =
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "Space" ||
        event.code === "Space";
      const isEnter = event.key === "Enter" || event.code === "Enter";
      if (isSpace || isEnter) {
        event.preventDefault();
        suppressClickRef.current = true;
        onCheckedChange(!checked);
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative inline-flex h-9 w-14 items-center rounded-full border border-border/80 bg-surface-2 transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "border-accent-cyan/60 bg-accent-cyan/30" : "bg-surface-2",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "absolute top-1 inline-flex h-6 w-6 rounded-full bg-primary transition-[left] duration-200 ease-out",
            checked ? "left-7" : "left-1",
          )}
        />
      </button>
    );
  },
);

Switch.displayName = "Switch";

export { Switch };
export type { SwitchProps };
