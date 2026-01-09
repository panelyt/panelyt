"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface Props {
  biomarkers: SelectedBiomarker[];
  onRemove: (code: string) => void;
  onClearAll: () => void;
}

export function SelectedBiomarkers({ biomarkers, onRemove, onClearAll }: Props) {
  const t = useTranslations();
  const count = biomarkers.length;
  const shouldConfirmClear = count > 3;

  const clearAllButton = (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      disabled={count === 0}
      className="border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
      onClick={!shouldConfirmClear ? onClearAll : undefined}
    >
      {t("home.clearAll")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">
          {t("home.selectedCount", { count })}
        </p>
        {shouldConfirmClear ? (
          <Dialog>
            <DialogTrigger asChild>{clearAllButton}</DialogTrigger>
            <DialogContent>
              <DialogTitle>{t("home.clearAllTitle")}</DialogTitle>
              <DialogDescription className="mt-2">
                {t("home.clearAllDescription")}
              </DialogDescription>
              <div className="mt-6 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary" size="sm" type="button">
                    {t("common.cancel")}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    type="button"
                    onClick={onClearAll}
                  >
                    {t("home.clearAllConfirm")}
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          clearAllButton
        )}
      </div>
      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 p-4 text-sm text-slate-400">
          {t("home.emptyBiomarkers")}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2" role="list">
          {biomarkers.map((biomarker) => (
            <li
              key={biomarker.code}
              className="flex items-center gap-3 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-emerald-100 transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-100"
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{biomarker.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(biomarker.code)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-emerald-200 transition hover:bg-red-500/20 hover:text-red-100 focus-ring"
                aria-label={t("common.remove", { name: biomarker.name })}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
