import * as React from "react";
import { Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-ring disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-accent-cyan text-slate-950 hover:bg-cyan-300",
        secondary: "border border-border/80 bg-transparent text-primary hover:bg-surface-2",
        destructive: "border border-accent-red/60 text-accent-red hover:bg-accent-red/10",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...props}
    >
      {loading ? (
        <Loader2
          className="h-4 w-4 animate-spin"
          data-testid="button-spinner"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  ),
);

Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
