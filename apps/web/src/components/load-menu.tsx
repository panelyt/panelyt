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

export interface LoadMenuProps {
  lists: SavedList[];
  isLoading: boolean;
  onSelect: (list: SavedList) => void;
}

export function LoadMenu({ lists, isLoading, onSelect }: LoadMenuProps) {
  const t = useTranslations();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          {t("common.load")}
        </button>
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
