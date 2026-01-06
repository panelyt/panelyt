"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { SavedList } from "@panelyt/types";

import { Link, getPathname, useRouter } from "../../../i18n/navigation";
import { Header } from "../../../components/header";
import { useSavedLists } from "../../../hooks/useSavedLists";
import { useUserSession } from "../../../hooks/useUserSession";
import { useAccountSettings } from "../../../hooks/useAccountSettings";
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
  const [error, setError] = useState<ReactNode | null>(null);
  const [shareActionId, setShareActionId] = useState<string | null>(null);
  const [unshareActionId, setUnshareActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const shareOrigin = useMemo(
    () => (typeof window === "undefined" ? "" : window.location.origin),
    [],
  );

  useEffect(() => {
    if (!copiedId) {
      return;
    }
    const timer = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedId]);

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

  const telegramLinked = Boolean(account.settingsQuery.data?.telegram.chat_id);
  const allNotificationsEnabled = useMemo(
    () => formattedLists.length > 0 && formattedLists.every((item) => item.list.notify_on_price_drop),
    [formattedLists],
  );
  const bulkNotifyPending = notificationsBulkMutation.isPending;
  const hasLists = formattedLists.length > 0;

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

      notificationsBulkMutation.mutate(
        { notify: targetState },
        {
          onError: () => setError(t("errors.failedToUpdateAlerts")),
          onSuccess: () => setError(null),
        },
      );
    },
    [notificationsBulkMutation, telegramLinked, t],
  );

  const handleDelete = async (id: string) => {
    await savedLists.deleteMutation.mutateAsync(id);
  };

  const sharePath = useCallback(
    (token: string) => getPathname({ href: `/collections/shared/${token}`, locale }),
    [locale],
  );

  const buildShareUrl = useCallback(
    (token: string) => (shareOrigin ? `${shareOrigin}${sharePath(token)}` : sharePath(token)),
    [shareOrigin, sharePath],
  );

  const handleCopyShare = useCallback(
    async (token: string, listId: string) => {
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
        setCopiedId(listId);
        setError(null);
      } catch {
        setError(t("errors.failedToCopy"));
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
    const shareLink = shareToken ? buildShareUrl(shareToken) : null;
    const isSharePending = shareMutation.isPending && shareActionId === item.list.id;
    const isUnsharePending = unshareMutation.isPending && unshareActionId === item.list.id;
    const notifyPending =
      notificationsMutation.isPending &&
      notificationsMutation.variables?.id === item.list.id;
    const notificationsEnabled = item.list.notify_on_price_drop;
    const sharedTimestamp = item.list.shared_at ?? item.list.updated_at;
    const updatedAt = resolveUpdatedAt(item.list);

    return {
      shareToken,
      shareLink,
      isSharePending,
      isUnsharePending,
      notifyPending,
      notificationsEnabled,
      sharedTimestamp,
      updatedAt,
    };
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">{t("lists.title")}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {t("lists.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleAllAlerts(!allNotificationsEnabled)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!hasLists || bulkNotifyPending}
          >
            {bulkNotifyPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : allNotificationsEnabled ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {bulkNotifyPending
              ? t("common.loading")
              : allNotificationsEnabled
                ? t("lists.disableAllAlerts")
                : t("lists.enableAllAlerts")}
          </button>
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
                                      void handleCopyShare(
                                        shareToken,
                                        item.list.id,
                                      )
                                    }
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    {copiedId === item.list.id
                                      ? t("common.copied")
                                      : t("lists.copyLink")}
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
                                <DropdownMenuItem
                                  onClick={() =>
                                    router.push({
                                      pathname: "/",
                                      query: { list: item.list.id },
                                    })
                                  }
                                >
                                  {t("lists.loadInOptimizer")}
                                </DropdownMenuItem>
                                {shareToken && shareLink ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void handleCopyShare(
                                          shareToken,
                                          item.list.id,
                                        )
                                      }
                                    >
                                      <Copy className="h-4 w-4" />
                                      {t("lists.copyLink")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <a
                                        href={shareLink}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
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
                                  onClick={() => void handleDelete(item.list.id)}
                                  className="text-rose-300 focus:text-rose-200"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                    className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-4 shadow-lg shadow-slate-900/40"
                  >
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-lg font-semibold text-white">{item.list.name}</p>
                        <p className="text-xs text-slate-400">
                          {t("common.biomarkersCount", {
                            count: item.list.biomarkers.length,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            {t("results.currentTotal")}
                          </span>
                          <p className="font-semibold text-white">{formatTotal(item)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
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
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              router.push({
                                pathname: "/",
                                query: { list: item.list.id },
                              })
                            }
                          >
                            {t("lists.loadInOptimizer")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleDelete(item.list.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
                      {shareToken && shareLink ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-2 text-slate-400">
                              <LinkIcon className="h-4 w-4" />
                              <span className="font-semibold text-slate-200">
                                {t("lists.shareLink")}
                              </span>
                            </span>
                            <span className="truncate font-mono text-sm text-slate-200">
                              {shareLink}
                            </span>
                            {listState.sharedTimestamp && (
                              <span className="text-[11px] text-slate-500">
                                {t("common.updated")}{" "}
                                {new Date(listState.sharedTimestamp).toLocaleString("pl-PL")}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void handleCopyShare(
                                  shareToken,
                                  item.list.id,
                                )
                              }
                            >
                              <Copy className="h-3.5 w-3.5" />
                              {copiedId === item.list.id
                                ? t("common.copied")
                                : t("lists.copyLink")}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              loading={listState.isSharePending}
                              onClick={() => void handleShare(item.list.id, true)}
                            >
                              <RefreshCcw className="h-3.5 w-3.5" />
                              {listState.isSharePending
                                ? t("lists.regenerating")
                                : t("lists.regenerate")}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              loading={listState.isUnsharePending}
                              onClick={() => void handleUnshare(item.list.id)}
                            >
                              {listState.isUnsharePending
                                ? t("lists.disabling")
                                : t("lists.disableShare")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className="text-slate-400">
                            {t("lists.shareDescription")}
                          </p>
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
