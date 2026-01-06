"use client";

import { useMemo, useState, useId, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import { usePanelStore } from "@/stores/panelStore";

const DEFAULT_PASTE_LIMIT = 200;

type PasteParseError = "empty" | "too_long";

interface PasteParseResult {
  codes: string[];
  error: PasteParseError | null;
}

export function parsePastedCodes(value: string, limit = DEFAULT_PASTE_LIMIT): PasteParseResult {
  const rawItems = value.split(/[,\n]/);
  const codes: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawItems) {
    const normalized = entry.trim();
    if (!normalized) continue;
    const uppercased = normalized.toUpperCase();
    if (seen.has(uppercased)) continue;
    seen.add(uppercased);
    codes.push(uppercased);
  }

  if (codes.length === 0) {
    return { codes, error: "empty" };
  }

  if (codes.length > limit) {
    return { codes, error: "too_long" };
  }

  return { codes, error: null };
}

export function PasteCodesDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<PasteParseError | null>(null);
  const descriptionId = useId();
  const errorId = useId();

  const errorMessage = useMemo(() => {
    if (error === "empty") return t("home.pasteEmpty");
    if (error === "too_long") return t("home.pasteTooLong", { limit: DEFAULT_PASTE_LIMIT });
    return null;
  }, [error, t]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parsePastedCodes(value);
    if (result.error) {
      setError(result.error);
      return;
    }

    const currentSelection = usePanelStore.getState().selected;
    const existing = new Set(currentSelection.map((item) => item.code));
    const additions = result.codes.filter((code) => !existing.has(code));

    if (additions.length > 0) {
      usePanelStore.getState().addMany(additions.map((code) => ({ code, name: code })));
    }

    toast(t("home.pasteAdded", { count: additions.length }));
    setValue("");
    setError(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          {t("home.pasteList")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t("home.pasteTitle")}</DialogTitle>
        <DialogDescription id={descriptionId} className="mt-2">
          {t("home.pasteDescription")}
        </DialogDescription>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <textarea
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            className={`min-h-[140px] w-full resize-y rounded-lg border bg-slate-950/60 p-3 text-sm text-white outline-none focus-ring ${
              error ? "border-accent-red/70" : "border-border/80"
            }`}
            placeholder={t("home.pastePlaceholder")}
            aria-label={t("home.pasteTitle")}
            aria-describedby={errorMessage ? `${descriptionId} ${errorId}` : descriptionId}
            aria-invalid={error ? true : undefined}
          />
          {errorMessage && (
            <p id={errorId} className="text-xs text-accent-red">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary">
              {t("home.pasteAction")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
