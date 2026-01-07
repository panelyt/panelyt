"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { SearchBox } from "@/components/search-box";
import { useBiomarkerSelection } from "@/hooks/useBiomarkerSelection";
import { useUserSession } from "@/hooks/useUserSession";
import { useSaveListModal } from "@/hooks/useSaveListModal";
import { useUrlBiomarkerSync } from "@/hooks/useUrlBiomarkerSync";
import { PanelPill } from "@/features/panel/PanelPill";
import { SaveListModal } from "@/components/save-list-modal";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { track } from "@/lib/analytics";
import { requestAuthModal } from "@/lib/auth-events";
import { usePanelStore } from "@/stores/panelStore";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

export function PanelTray() {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selection = useBiomarkerSelection();
  const selected = selection.selected;
  const remove = usePanelStore((state) => state.remove);
  const summary = usePanelStore((state) => state.lastOptimizationSummary);
  const countLabel = t("common.biomarkersCount", { count: selected.length });
  const summaryLabel = summary ? formatCurrency(summary.totalNow) : t("panelTray.runOptimize");

  const sessionQuery = useUserSession();
  const isAuthenticated = Boolean(sessionQuery.data?.registered);
  const saveListModal = useSaveListModal({
    isAuthenticated,
    biomarkers: selected,
    onRequireAuth: requestAuthModal,
  });

  const shareSync = useUrlBiomarkerSync({
    selected,
    onLoadFromUrl: () => {},
    skipSync: true,
    locale,
  });

  const savings = useMemo(() => {
    if (!summary) return null;
    const amount = Math.max(summary.totalNow - summary.totalMin30, 0);
    return amount > 0 ? amount : null;
  }, [summary]);

  useEffect(() => {
    if (!open) {
      if (document.body.dataset.searchHotkeyScope === "panel-tray") {
        delete document.body.dataset.searchHotkeyScope;
      }
      return;
    }

    document.body.dataset.searchHotkeyScope = "panel-tray";

    return () => {
      if (document.body.dataset.searchHotkeyScope === "panel-tray") {
        delete document.body.dataset.searchHotkeyScope;
      }
    };
  }, [open]);

  const handleShare = async () => {
    const success = await shareSync.copyShareUrl();
    track("share_copy_url", { status: success ? "success" : "failure" });
    toast(success ? t("toast.shareCopied") : t("toast.shareCopyFailed"));
  };

  const handleOpenSaveList = () => {
    setOpen(false);
    saveListModal.open(
      selected.length
        ? t("saveList.defaultName", { date: new Date().toLocaleDateString() })
        : "",
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <PanelPill className="hidden md:inline-flex" />
        </DialogTrigger>
        <DialogTrigger asChild>
          <button
            type="button"
            data-testid="panel-tray-mobile"
            aria-label={t("panelTray.openPanel")}
            className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-border/80 bg-surface-1 px-4 py-3 text-sm text-primary shadow-lg shadow-black/40 md:hidden"
          >
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-secondary">
                {t("panelTray.title")}
              </span>
              <span className="text-sm font-semibold">{countLabel}</span>
            </div>
            <span className="text-sm font-semibold text-secondary">{summaryLabel}</span>
          </button>
        </DialogTrigger>
        <DialogContent
          className={cn(
            "left-auto right-0 top-0 bottom-0 h-full w-full max-w-none translate-x-0 translate-y-0 rounded-none border-l border-border/80 bg-surface-1 p-6 sm:w-[420px] sm:rounded-l-3xl",
          )}
          aria-describedby={undefined}
        >
          <div className="flex h-full flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="text-xl font-semibold">
                {t("panelTray.title")}
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-full border border-border/80 p-2 text-secondary transition hover:border-emerald-400/60 hover:text-primary focus-ring"
                  aria-label={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
            </div>

            {summary && (
              <div className="rounded-2xl border border-border/80 bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                    {t("panelTray.bestLab", { lab: summary.labCode.toUpperCase() })}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(summary.totalNow)}
                  </span>
                </div>
                {savings !== null && (
                  <p className="mt-2 text-xs text-emerald-300">
                    {t("panelTray.savings", { amount: formatCurrency(savings) })}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-border/80 bg-surface-2/60 p-4">
              <SearchBox
                onSelect={selection.handleSelect}
                onTemplateSelect={selection.handleTemplateSelect}
                hotkeyScope="panel-tray"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {selected.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/80 bg-surface-2/60 p-4 text-sm text-secondary">
                  {t("panelTray.empty")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label={t("panelTray.selectedTitle")}>
                  {selected.map((biomarker) => (
                    <li
                      key={biomarker.code}
                      className="group flex items-center gap-2 rounded-full border border-border/80 bg-surface-2 px-3 py-2 text-xs text-primary"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{biomarker.name}</span>
                        <span className="text-[11px] font-mono text-secondary">
                          {biomarker.code}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(biomarker.code)}
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-secondary transition hover:bg-red-500/10 hover:text-red-300 focus-ring"
                        aria-label={t("common.remove", { name: biomarker.name })}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <DialogClose asChild>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-lg border border-border/80 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-surface-2 focus-ring"
                >
                  {t("panelTray.openOptimizer")}
                </Link>
              </DialogClose>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleShare()}
                disabled={selected.length === 0}
              >
                {t("panelTray.sharePanel")}
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleOpenSaveList}
                disabled={selected.length === 0}
              >
                {t("panelTray.saveList")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SaveListModal
        open={saveListModal.isOpen}
        name={saveListModal.name}
        error={saveListModal.error}
        isSaving={saveListModal.isSaving}
        onNameChange={saveListModal.setName}
        onClose={saveListModal.close}
        onConfirm={saveListModal.handleConfirm}
      />
    </>
  );
}
