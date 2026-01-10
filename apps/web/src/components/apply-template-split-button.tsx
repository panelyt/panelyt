"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

type ApplyTemplateSplitButtonProps = {
  onAddToPanel: () => void;
  onReplacePanel: () => void;
  onViewDetails: () => void;
  isAdmin?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
};

function ApplyTemplateSplitButton({
  onAddToPanel,
  onReplacePanel,
  onViewDetails,
  isAdmin = false,
  onEdit,
  onDelete,
  size = "md",
  disabled = false,
  className,
}: ApplyTemplateSplitButtonProps) {
  const t = useTranslations();

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        size={size}
        onClick={onAddToPanel}
        disabled={disabled}
        className="rounded-r-none"
      >
        {t("collections.apply")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            disabled={disabled}
            aria-label={t("collections.applyMenu")}
            className="w-10 rounded-l-none border-l border-slate-950/20 px-0"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAddToPanel()}>
            {t("collections.addToPanel")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onReplacePanel()}>
            {t("collections.replacePanel")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onViewDetails()}>
            {t("collections.viewDetails")}
          </DropdownMenuItem>
          {isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onEdit?.()}>
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onDelete?.()}
                className="text-accent-red"
              >
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { ApplyTemplateSplitButton };
export type { ApplyTemplateSplitButtonProps };
