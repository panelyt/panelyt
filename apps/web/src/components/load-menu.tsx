"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SavedList } from "@panelyt/types";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Button } from "@/ui/button";

export interface LoadMenuProps {
  lists: SavedList[];
  isLoading: boolean;
  onSelect: (list: SavedList) => void;
  disabled?: boolean;
}

export function LoadMenu({ lists, isLoading, onSelect, disabled = false }: LoadMenuProps) {
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={disabled}
          className="border-transparent text-slate-400 hover:bg-surface-2/60 hover:text-slate-200"
        >
          {t("common.load")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("loadMenu.savedLists")}</DropdownMenuLabel>
        {isLoading && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("common.loading")}
          </div>
        )}
        {!isLoading && lists.length === 0 && (
          <p className="px-3 py-2 text-xs text-secondary">{t("loadMenu.noSavedLists")}</p>
        )}
        {!isLoading &&
          lists.map((list) => (
            <DropdownMenuItem
              key={list.id}
              onSelect={() => onSelect(list)}
              className="flex w-full items-center justify-between"
            >
              <span className="font-semibold">{list.name}</span>
              <span className="text-[11px] text-secondary">
                {t("common.biomarkersCount", { count: list.biomarkers.length })}
              </span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
