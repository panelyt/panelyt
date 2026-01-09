"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SavedList } from "@panelyt/types";

import { LoadMenu } from "@/components/load-menu";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/tooltip";

interface PanelActionsProps {
  isAdmin: boolean;
  isPanelHydrated: boolean;
  selectionCount: number;
  lists: SavedList[];
  isLoadingLists: boolean;
  onSave: () => void;
  onShare: () => void;
  onLoad: (list: SavedList) => void;
  onSaveTemplate: () => void;
  shareButtonContent: React.ReactNode;
}

interface ActionTooltipProps {
  disabled: boolean;
  reason?: string;
  children: React.ReactElement;
}

const ActionTooltip = ({ disabled, reason, children }: ActionTooltipProps) => {
  const [open, setOpen] = useState(false);

  if (!disabled || !reason) {
    return children;
  }

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex"
          tabIndex={0}
          onBlur={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
};

export function PanelActions({
  isAdmin,
  isPanelHydrated,
  selectionCount,
  lists,
  isLoadingLists,
  onSave,
  onShare,
  onLoad,
  onSaveTemplate,
  shareButtonContent,
}: PanelActionsProps) {
  const t = useTranslations();
  const saveDisabled = !isPanelHydrated || selectionCount === 0;
  const shareDisabled = !isPanelHydrated || selectionCount === 0;
  const loadDisabled = lists.length === 0;
  const templateDisabled = !isPanelHydrated || selectionCount === 0;

  const saveDisabledReason = saveDisabled
    ? !isPanelHydrated
      ? t("home.actionsDisabledLoading")
      : t("home.saveDisabledEmpty")
    : undefined;
  const shareDisabledReason = shareDisabled
    ? !isPanelHydrated
      ? t("home.actionsDisabledLoading")
      : t("home.shareDisabledEmpty")
    : undefined;
  const loadDisabledReason = loadDisabled
    ? isLoadingLists
      ? t("home.loadDisabledLoading")
      : t("loadMenu.noSavedLists")
    : undefined;
  const templateDisabledReason = templateDisabled
    ? !isPanelHydrated
      ? t("home.actionsDisabledLoading")
      : t("home.templateDisabledEmpty")
    : undefined;

  const moreButton = (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      disabled={templateDisabled}
      className="border-transparent text-slate-400 hover:bg-surface-2/60 hover:text-slate-200"
    >
      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      {t("common.more")}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-2">
        <ActionTooltip disabled={saveDisabled} reason={saveDisabledReason}>
          <Button
            variant="primary"
            size="sm"
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
          >
            {t("common.save")}
          </Button>
        </ActionTooltip>
        <ActionTooltip disabled={shareDisabled} reason={shareDisabledReason}>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onShare}
            disabled={shareDisabled}
          >
            {shareButtonContent}
          </Button>
        </ActionTooltip>
        <ActionTooltip disabled={loadDisabled} reason={loadDisabledReason}>
          <LoadMenu
            lists={lists}
            isLoading={isLoadingLists}
            onSelect={onLoad}
            disabled={loadDisabled}
          />
        </ActionTooltip>
        {isAdmin &&
          (templateDisabled ? (
            <ActionTooltip disabled={templateDisabled} reason={templateDisabledReason}>
              {moreButton}
            </ActionTooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{moreButton}</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onSaveTemplate}>
                  {t("home.saveAsTemplate")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </div>
    </TooltipProvider>
  );
}
