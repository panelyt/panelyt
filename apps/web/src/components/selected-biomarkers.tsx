"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
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
  loadingCodes?: string[];
}

interface BiomarkerChipProps {
  biomarker: SelectedBiomarker;
  onRemove: (code: string) => void;
  removeLabel: string;
  removeText: string;
  isHighlighted: boolean;
  isLoading: boolean;
}

const BiomarkerChip = ({
  biomarker,
  onRemove,
  removeLabel,
  removeText,
  isHighlighted,
  isLoading,
}: BiomarkerChipProps) => {
  const [isActive, setIsActive] = useState(false);

  return (
    <li
      key={biomarker.code}
      className="min-w-0"
    >
      <button
        type="button"
        onClick={() => onRemove(biomarker.code)}
        className={cn(
          "relative inline-flex min-w-0 items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-100 transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-100 focus-ring",
          isHighlighted
            ? "ring-1 ring-emerald-300/60 motion-safe:animate-[pulse_1.2s_ease-out_1]"
            : "",
        )}
        aria-label={removeLabel}
        title={isLoading ? undefined : biomarker.name}
        onBlur={() => setIsActive(false)}
        onFocus={() => setIsActive(true)}
        onMouseEnter={() => setIsActive(true)}
        onMouseLeave={() => setIsActive(false)}
      >
        <span
          className={cn(
            "max-w-[200px] truncate text-sm font-semibold transition-opacity",
            isActive ? "opacity-0" : "opacity-100",
            isLoading ? "blur-[2px] opacity-70" : "",
          )}
          aria-busy={isLoading}
        >
          {biomarker.name}
        </span>
        {isActive ? (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
            {removeText}
          </span>
        ) : null}
      </button>
    </li>
  );
};

export function SelectedBiomarkers({
  biomarkers,
  onRemove,
  onClearAll,
  loadingCodes = [],
}: Props) {
  const t = useTranslations();
  const count = biomarkers.length;
  const shouldConfirmClear = count > 3;
  const [highlightedCodes, setHighlightedCodes] = useState<Set<string>>(new Set());
  const previousCodes = useRef<Set<string>>(new Set());
  const hasMounted = useRef(false);
  const highlightTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const loadingSet = useMemo(
    () =>
      new Set(loadingCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
    [loadingCodes],
  );

  useEffect(() => {
    const currentCodes = new Set(biomarkers.map((biomarker) => biomarker.code));

    if (!hasMounted.current) {
      hasMounted.current = true;
      previousCodes.current = currentCodes;
      return;
    }

    setHighlightedCodes((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const code of prev) {
        if (currentCodes.has(code)) {
          next.add(code);
          continue;
        }
        const timeout = highlightTimeouts.current.get(code);
        if (timeout) {
          clearTimeout(timeout);
          highlightTimeouts.current.delete(code);
        }
        changed = true;
      }
      return changed ? next : prev;
    });

    const additions = biomarkers.filter(
      (biomarker) => !previousCodes.current.has(biomarker.code),
    );

    if (additions.length > 0) {
      setHighlightedCodes((prev) => {
        const next = new Set(prev);
        additions.forEach((biomarker) => {
          next.add(biomarker.code);
        });
        return next;
      });

      additions.forEach((biomarker) => {
        const existingTimeout = highlightTimeouts.current.get(biomarker.code);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        const timeout = setTimeout(() => {
          setHighlightedCodes((prev) => {
            if (!prev.has(biomarker.code)) {
              return prev;
            }
            const next = new Set(prev);
            next.delete(biomarker.code);
            return next;
          });
          highlightTimeouts.current.delete(biomarker.code);
        }, 1200);
        highlightTimeouts.current.set(biomarker.code, timeout);
      });
    }

    previousCodes.current = currentCodes;
  }, [biomarkers]);

  useEffect(() => {
    const timeouts = highlightTimeouts.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

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
            <BiomarkerChip
              key={biomarker.code}
              biomarker={biomarker}
              onRemove={onRemove}
              removeLabel={t("common.remove", { name: biomarker.name })}
              removeText={t("common.removeShort")}
              isHighlighted={highlightedCodes.has(biomarker.code)}
              isLoading={loadingSet.has(biomarker.code.trim().toUpperCase())}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
