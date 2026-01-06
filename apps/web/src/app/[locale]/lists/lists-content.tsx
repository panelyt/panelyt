"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  BellOff,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { SavedList } from "@panelyt/types";

import { Link, getPathname, useRouter } from "../../../i18n/navigation";
import { Header } from "../../../components/header";
import { useSavedLists } from "../../../hooks/useSavedLists";
import { useUserSession } from "../../../hooks/useUserSession";
import { useAccountSettings } from "../../../hooks/useAccountSettings";
import { track } from "../../../lib/analytics";
import { usePanelStore } from "../../../stores/panelStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../ui/table";
import { Button } from "../../../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../ui/tooltip";

interface ListWithTotals {
  list: SavedList;
  total: number | null;
  currency: string | null;
}

const CURRENCY_CODE = "PLN";

export default function ListsContent() {
  const t = useTranslations();
  const session = useUserSession();
  const savedLists = useSavedLists(Boolean(session.data));
  const account = useAccountSettings(Boolean(session.data));
  const { shareMutation, unshareMutation, notificationsMutation, notificationsBulkMutation } =
    savedLists;
  const rawLists = savedLists.listsQuery.data;
  const locale = useLocale();
  const router = useRouter();
  const replaceAll = usePanelStore((state) => state.replaceAll);
  const [error, setError] = useState<ReactNode | null>(null);
  const [shareActionId, setShareActionId] = useState<string | null>(null);
  const [unshareActionId, setUnshareActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<boolean | null>(null);

  const formattedLists = useMemo(() => {
    const lists = rawLists ?? [];
    return lists.map((list) => {
      if (list.biomarkers.length === 0) {
        return {
          list,
          total: 0,
          currency: CURRENCY_CODE,
        } satisfies ListWithTotals;
      }
      const totalGrosz = list.last_known_total_grosz;
      const total = totalGrosz === null ? null : totalGrosz / 100;
      return {
        list,
        total,
        currency: total === null ? null : CURRENCY_CODE,
      } satisfies ListWithTotals;
    });
  }, [rawLists]);

  const listsCount = formattedLists.length;
  const alertsEnabledCount = useMemo(
    () =>
      formattedLists.reduce(
        (count, item) => count + (item.list.notify_on_price_drop ? 1 : 0),
        0,
      ),
    [formattedLists],
  );

  const telegramLinked = Boolean(account.settingsQuery.data?.telegram.chat_id);
  const allNotificationsEnabled = useMemo(
    () => listsCount > 0 && alertsEnabledCount === listsCount,
    [alertsEnabledCount, listsCount],
  );
  const hasAlertsEnabled = alertsEnabledCount > 0;
  const bulkNotifyPending = notificationsBulkMutation.isPending;
  const hasLists = listsCount > 0;
  const enableAllDisabled = !hasLists || bulkNotifyPending || allNotificationsEnabled;
  const disableAllDisabled = !hasLists || bulkNotifyPending || !hasAlertsEnabled;

  const handleToggleAlerts = useCallback(
    (id: string, currentlyEnabled: boolean) => {
      if (!currentlyEnabled && !telegramLinked) {
        setError(
          <>
            {t.rich("lists.linkTelegramFirst", {
              link: (chunks) => (
                <Link href="/account" className="underline text-sky-300">
                  {chunks}
                </Link>
              ),
            })}
          </>,
        );
        return;
      }

      notificationsMutation.mutate(
        { id, notify: !currentlyEnabled },
        {
          onError: () => setError(t("errors.failedToUpdateAlerts")),
          onSuccess: () => setError(null),
        },
      );
      track("alerts_toggle", { mode: "single", enabled: !currentlyEnabled });
    },
    [notificationsMutation, telegramLinked, t],
  );

  const handleToggleAllAlerts = useCallback(
    (targetState: boolean) => {
      if (targetState && !telegramLinked) {
        setError(
          <>
            {t.rich("lists.linkTelegramFirst", {
              link: (chunks) => (
                <Link href="/account" className="underline text-sky-300">
                  {chunks}
                </Link>
              ),
            })}
          </>,
        );
        return;
      }

      setBulkTarget(targetState);
      notificationsBulkMutation.mutate(
        { notify: targetState },
        {
          onError: () => setError(t("errors.failedToUpdateAlerts")),
          onSuccess: () => setError(null),
          onSettled: () => setBulkTarget(null),
        },
      );
      track("alerts_toggle", { mode: "bulk", enabled: targetState });
    },
    [notificationsBulkMutation, telegramLinked, t],
  );

  const handleDeleteDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteTarget(null);
      setDeletePending(false);
    }
  }, []);

  const handleDeleteRequest = useCallback((list: SavedList) => {
    setDeleteTarget({ id: list.id, name: list.name });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setDeletePending(true);
    try {
      await savedLists.deleteMutation.mutateAsync(deleteTarget.id);
      setError(null);
    } catch {
      setError(t("errors.failedToDelete"));
    } finally {
      setDeletePending(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, savedLists.deleteMutation, t]);

  const sharePath = useCallback(
    (token: string) => getPathname({ href: `/collections/shared/${token}`, locale }),
    [locale],
  );

  const buildShareUrl = useCallback(
    (token: string) => {
      const path = sharePath(token);
      if (typeof window === "undefined") {
        return path;
      }
      return `${window.location.origin}${path}`;
    },
    [sharePath],
  );

  const handleCopyShare = useCallback(
    async (token: string) => {
      try {
        const url = buildShareUrl(token);
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(url);
        } else if (typeof document !== "undefined") {
          const textarea = document.createElement("textarea");
          textarea.value = url;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } else {
          throw new Error("clipboard unavailable");
        }
        toast(t("toast.shareCopied"));
        setError(null);
        track("share_copy_url", { status: "success" });
      } catch {
        toast(t("toast.shareCopyFailed"));
        track("share_copy_url", { status: "failure" });
      }
    },
    [buildShareUrl, t],
  );

  const handleShare = useCallback(
    async (id: string, regenerate = false) => {
      try {
        setShareActionId(id);
        await shareMutation.mutateAsync({ id, regenerate });
        setError(null);
      } catch {
        setError(regenerate ? t("errors.failedToRegenerate") : t("errors.failedToShare"));
      } finally {
        setShareActionId(null);
      }
    },
    [shareMutation, t],
  );

  const handleUnshare = useCallback(
    async (id: string) => {
      try {
        setUnshareActionId(id);
        await unshareMutation.mutateAsync(id);
        setError(null);
      } catch {
        setError(t("errors.failedToDisableShare"));
      } finally {
        setUnshareActionId(null);
      }
    },
    [unshareMutation, t],
  );

  const resolveUpdatedAt = useCallback((list: SavedList) => {
    return list.last_total_updated_at ?? list.updated_at;
  }, []);

  const formatExactTimestamp = useCallback(
    (value: string) => {
      const timestamp = new Date(value);
      if (Number.isNaN(timestamp.getTime())) {
        return "—";
      }
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp);
    },
    [locale],
  );

  const formatRelativeTimestamp = useCallback(
    (value: string) => {
      const timestamp = new Date(value).getTime();
      if (Number.isNaN(timestamp)) {
        return "—";
      }
      const diff = timestamp - Date.now();
      const ranges: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
        { unit: "year", ms: 1000 * 60 * 60 * 24 * 365 },
        { unit: "month", ms: 1000 * 60 * 60 * 24 * 30 },
        { unit: "day", ms: 1000 * 60 * 60 * 24 },
        { unit: "hour", ms: 1000 * 60 * 60 },
        { unit: "minute", ms: 1000 * 60 },
        { unit: "second", ms: 1000 },
      ];
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      for (const range of ranges) {
        if (Math.abs(diff) >= range.ms || range.unit === "second") {
          return formatter.format(Math.round(diff / range.ms), range.unit);
        }
      }
      return formatter.format(0, "second");
    },
    [locale],
  );

  const lastUpdatedAt = useMemo(() => {
    if (formattedLists.length === 0) {
      return null;
    }
    let latestTimestamp = -Infinity;
    let latestValue: string | null = null;
    for (const item of formattedLists) {
      const value = resolveUpdatedAt(item.list);
      const timestamp = new Date(value).getTime();
      if (Number.isNaN(timestamp)) {
        continue;
      }
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestValue = value;
      }
    }
    return latestValue;
  }, [formattedLists, resolveUpdatedAt]);

  const formatTotal = (item: ListWithTotals) => {
    if (item.total === null || item.currency === null) {
      return "—";
    }
    const formatter = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: item.currency,
      maximumFractionDigits: 2,
    });
    return formatter.format(item.total);
  };

  const buildListState = (item: ListWithTotals) => {
    const shareToken = item.list.share_token;
    const shareLink = shareToken ? sharePath(shareToken) : null;
    const isSharePending = shareMutation.isPending && shareActionId === item.list.id;
    const isUnsharePending = unshareMutation.isPending && unshareActionId === item.list.id;
    const notifyPending =
      notificationsMutation.isPending &&
      notificationsMutation.variables?.id === item.list.id;
    const notificationsEnabled = item.list.notify_on_price_drop;
    const updatedAt = resolveUpdatedAt(item.list);

    return {
      shareToken,
      shareLink,
      isSharePending,
      isUnsharePending,
      notifyPending,
      notificationsEnabled,
      updatedAt,
    };
  };

  const handleLoadInOptimizer = useCallback(
    (list: SavedList) => {
      replaceAll(
        list.biomarkers.map((entry) => ({
          code: entry.code,
          name: entry.display_name || entry.code,
        })),
      );
      router.push("/");
    },
    [replaceAll, router],
  );

  const renderActionsMenu = (
    item: ListWithTotals,
    listState: ReturnType<typeof buildListState>,
  ) => {
    const shareToken = listState.shareToken;
    const shareLink = listState.shareLink;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={t("lists.actionsFor", {
              name: item.list.name,
            })}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleLoadInOptimizer(item.list)}>
            {t("lists.loadInOptimizer")}
          </DropdownMenuItem>
          {shareToken && shareLink ? (
            <>
              <DropdownMenuItem onClick={() => void handleCopyShare(shareToken)}>
                <Copy className="h-4 w-4" />
                {t("lists.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={shareLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t("lists.openShare")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleShare(item.list.id, true)}
                disabled={listState.isSharePending}
              >
                <RefreshCcw className="h-4 w-4" />
                {listState.isSharePending
                  ? t("lists.regenerating")
                  : t("lists.regenerate")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleUnshare(item.list.id)}
                disabled={listState.isUnsharePending}
              >
                {listState.isUnsharePending
                  ? t("lists.disabling")
                  : t("lists.disableShare")}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              onClick={() => void handleShare(item.list.id)}
              disabled={listState.isSharePending}
            >
              {listState.isSharePending
                ? t("lists.generating")
                : t("lists.enableShare")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleDeleteRequest(item.list)}
            className="text-rose-300 focus:text-rose-200"
          >
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <Dialog open={Boolean(deleteTarget)} onOpenChange={handleDeleteDialogChange}>
        <DialogContent>
          <DialogTitle>
            {t("lists.deleteTitle", { name: deleteTarget?.name ?? "" })}
          </DialogTitle>
          <DialogDescription className="mt-2">
            {t("lists.deleteDescription")}
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={deletePending}
              >
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              type="button"
              loading={deletePending}
              onClick={() => void handleDeleteConfirm()}
            >
              {t("lists.deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">{t("lists.title")}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {t("lists.description")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => handleToggleAllAlerts(true)}
              loading={bulkNotifyPending && bulkTarget === true}
              disabled={enableAllDisabled}
            >
              <Bell className="h-4 w-4" />
              {t("lists.enableAllAlerts")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleToggleAllAlerts(false)}
              loading={bulkNotifyPending && bulkTarget === false}
              disabled={disableAllDisabled}
            >
              <BellOff className="h-4 w-4" />
              {t("lists.disableAllAlerts")}
            </Button>
          </div>
        </div>
        <div
          className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4"
          data-testid="lists-summary"
        >
          <TooltipProvider delayDuration={0}>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-slate-500">
                  {t("lists.summary.lists")}
                </span>
                <span className="font-mono text-sm text-slate-100">
                  {listsCount}
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-slate-500">
                  {t("lists.summary.alertsEnabled")}
                </span>
                <span className="font-mono text-sm text-slate-100">
                  {alertsEnabledCount}
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wide text-slate-500">
                  {t("lists.summary.lastUpdated")}
                </span>
                {lastUpdatedAt ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default font-mono text-sm text-slate-100">
                        {formatRelativeTimestamp(lastUpdatedAt)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {formatExactTimestamp(lastUpdatedAt)}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="font-mono text-sm text-slate-500">—</span>
                )}
              </div>
            </div>
          </TooltipProvider>
        </div>
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-10">
        {savedLists.listsQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("lists.loadingLists")}
          </div>
        ) : formattedLists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/70 px-6 py-8 text-center text-sm text-slate-400">
            {t.rich("lists.noLists", { saveButton: (chunks) => <span className="text-emerald-300">{chunks}</span> })}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="hidden md:block">
              <TooltipProvider delayDuration={0}>
                <Table dense stickyHeader>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("lists.table.name")}</TableHead>
                      <TableHead>{t("lists.table.biomarkers")}</TableHead>
                      <TableHead>{t("lists.table.total")}</TableHead>
                      <TableHead>{t("lists.table.updated")}</TableHead>
                      <TableHead>{t("lists.table.alerts")}</TableHead>
                      <TableHead>{t("lists.table.share")}</TableHead>
                      <TableHead className="text-right">{t("lists.table.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formattedLists.map((item) => {
                      const listState = buildListState(item);
                      const shareToken = listState.shareToken;
                      const shareLink = listState.shareLink;
                      const updatedLabel = listState.updatedAt
                        ? formatRelativeTimestamp(listState.updatedAt)
                        : "—";

                      return (
                        <TableRow key={item.list.id}>
                          <TableCell className="min-w-[12rem] font-semibold text-white">
                            {item.list.name}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {t("common.biomarkersCount", {
                              count: item.list.biomarkers.length,
                            })}
                          </TableCell>
                          <TableCell className="font-mono text-slate-100">
                            {formatTotal(item)}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {listState.updatedAt ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default">
                                    {updatedLabel}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {formatExactTimestamp(listState.updatedAt)}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              loading={listState.notifyPending}
                              onClick={() =>
                                handleToggleAlerts(
                                  item.list.id,
                                  listState.notificationsEnabled,
                                )
                              }
                            >
                              {listState.notificationsEnabled ? (
                                <Bell className="h-3.5 w-3.5" />
                              ) : (
                                <BellOff className="h-3.5 w-3.5" />
                              )}
                              {listState.notificationsEnabled
                                ? t("lists.disableAlerts")
                                : t("lists.enableAlerts")}
                            </Button>
                          </TableCell>
                          <TableCell className="min-w-[14rem]">
                            {shareToken && shareLink ? (
                              <div className="flex flex-col gap-2">
                                <span className="text-xs text-slate-400">
                                  {t("lists.shareEnabled")}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() =>
                                        void handleCopyShare(shareToken)
                                      }
                                    >
                                    <Copy className="h-3.5 w-3.5" />
                                    {t("lists.copyLink")}
                                  </Button>
                                  <span className="sr-only">{shareLink}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <span className="text-xs text-slate-400">
                                  {t("lists.shareDisabled")}
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  loading={listState.isSharePending}
                                  onClick={() => void handleShare(item.list.id)}
                                >
                                  {listState.isSharePending
                                    ? t("lists.generating")
                                    : t("lists.enableShare")}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {renderActionsMenu(item, listState)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
            <div className="grid gap-4 md:hidden">
              {formattedLists.map((item) => {
                const listState = buildListState(item);
                const shareToken = listState.shareToken;
                const shareLink = listState.shareLink;

                return (
                  <div
                    key={item.list.id}
                    data-testid={`list-card-${item.list.id}`}
                    className="rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-white">{item.list.name}</p>
                        <p className="text-xs text-slate-400">
                          {t("common.biomarkersCount", {
                            count: item.list.biomarkers.length,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">
                          {t("results.currentTotal")}
                        </span>
                        <p className="font-mono text-sm text-white">{formatTotal(item)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={listState.notifyPending}
                        onClick={() =>
                          handleToggleAlerts(
                            item.list.id,
                            listState.notificationsEnabled,
                          )
                        }
                      >
                        {listState.notificationsEnabled ? (
                          <Bell className="h-3.5 w-3.5" />
                        ) : (
                          <BellOff className="h-3.5 w-3.5" />
                        )}
                        {listState.notificationsEnabled
                          ? t("lists.disableAlerts")
                          : t("lists.enableAlerts")}
                      </Button>
                      {shareToken && shareLink ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleCopyShare(shareToken)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t("lists.copyLink")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={listState.isSharePending}
                          onClick={() => void handleShare(item.list.id)}
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          {listState.isSharePending
                            ? t("lists.generating")
                            : t("lists.enableShare")}
                        </Button>
                      )}
                      <div className="ml-auto">{renderActionsMenu(item, listState)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
