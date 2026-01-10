import * as React from "react";

import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "@/ui/button";

type IconButtonProps = ButtonProps & {
  "aria-label": string;
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "icon", ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      className={cn("rounded-full", className)}
      {...props}
    />
  ),
);

IconButton.displayName = "IconButton";

export { IconButton };
export type { IconButtonProps };
