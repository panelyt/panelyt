"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SavedList } from "@panelyt/types";

export interface LoadMenuProps {
  lists: SavedList[];
  isLoading: boolean;
  onSelect: (list: SavedList) => void;
}

export function LoadMenu({ lists, isLoading, onSelect }: LoadMenuProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (list: SavedList) => {
    onSelect(list);
    setIsOpen(false);
  };

  return (
    <div className="relative z-30" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
      >
        {t("common.load")}
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={t("loadMenu.savedLists")}
          className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900/95 p-3 shadow-xl shadow-slate-900/50"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("loadMenu.savedLists")}
          </p>
          {isLoading && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("common.loading")}
            </div>
          )}
          {!isLoading && lists.length === 0 && (
            <p className="mt-3 text-xs text-slate-400">{t("loadMenu.noSavedLists")}</p>
          )}
          <div className="mt-3 space-y-2">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => handleSelect(list)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                <span className="font-semibold">{list.name}</span>
                <span className="text-[11px] text-slate-400">
                  {t("common.biomarkersCount", { count: list.biomarkers.length })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
