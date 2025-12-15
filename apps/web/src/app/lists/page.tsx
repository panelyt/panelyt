"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  Copy,
  Loader2,
  RefreshCcw,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import type { SavedList } from "@panelyt/types";

import { Header } from "../../components/header";
import { useSavedLists } from "../../hooks/useSavedLists";
import { useUserSession } from "../../hooks/useUserSession";
import { useAccountSettings } from "../../hooks/useAccountSettings";
import { postJson } from "../../lib/http";
import { OptimizeResponseSchema } from "@panelyt/types";

interface ListWithTotals {
  list: SavedList;
  total: number | null;
  currency: string | null;
}

interface ListTotalsValue {
  total: number | null;
  currency: string | null;
}

export default function ListsPage() {
  const session = useUserSession();
  const savedLists = useSavedLists(Boolean(session.data));
  const account = useAccountSettings(Boolean(session.data));
  const { shareMutation, unshareMutation, notificationsMutation, notificationsBulkMutation } =
    savedLists;
  const rawLists = savedLists.listsQuery.data;
  const router = useRouter();
  const [listTotals, setListTotals] = useState<Record<string, ListTotalsValue>>({});
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [error, setError] = useState<ReactNode | null>(null);
  const [shareActionId, setShareActionId] = useState<string | null>(null);
  const [unshareActionId, setUnshareActionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const totalsSignatureRef = useRef<string | null>(null);

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

  useEffect(() => {
    const lists = rawLists ?? [];
    if (!lists.length) {
      totalsSignatureRef.current = "";
      setListTotals({});
      setLoadingTotals(false);
      return;
    }

    const signature = lists
      .map((list) => `${list.id}:${list.biomarkers.map((entry) => entry.code).join(",")}`)
      .join("|");

    if (totalsSignatureRef.current === signature) {
      setLoadingTotals(false);
      return;
    }

    totalsSignatureRef.current = signature;

    let cancelled = false;
    setLoadingTotals(true);
    setError(null);

    const fetchTotals = async () => {
      try {
        const results = await Promise.all(
          lists.map(async (list) => {
            if (list.biomarkers.length === 0) {
              return [list.id, { total: 0, currency: "PLN" }] as const;
            }
            try {
              const payload = await postJson("/optimize", {
                biomarkers: list.biomarkers.map((entry) => entry.code),
              });
              const parsed = OptimizeResponseSchema.parse(payload);
              return [list.id, { total: parsed.total_now, currency: parsed.currency }] as const;
            } catch {
              return [list.id, { total: null, currency: null }] as const;
            }
          }),
        );

        if (!cancelled) {
          const totals: Record<string, ListTotalsValue> = {};
          for (const [id, value] of results) {
            totals[id] = value;
          }
          setListTotals(totals);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to calculate totals for saved lists.");
        }
      } finally {
        if (!cancelled) {
          setLoadingTotals(false);
        }
      }
    };

    fetchTotals();
    return () => {
      cancelled = true;
    };
  }, [rawLists]);

  const formattedLists = useMemo(() => {
    const lists = rawLists ?? [];
    return lists.map((list) => {
      const totals = listTotals[list.id];
      return {
        list,
        total: totals?.total ?? null,
        currency: totals?.currency ?? null,
      } satisfies ListWithTotals;
    });
  }, [rawLists, listTotals]);

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
            Link your Telegram chat in {" "}
            <Link href="/account" className="underline text-sky-300">
              Account settings
            </Link>{" "}
            before enabling alerts.
          </>,
        );
        return;
      }

      notificationsMutation.mutate(
        { id, notify: !currentlyEnabled },
        {
          onError: () => setError("Failed to update Telegram alerts."),
          onSuccess: () => setError(null),
        },
      );
    },
    [notificationsMutation, telegramLinked],
  );

  const handleToggleAllAlerts = useCallback(
    (targetState: boolean) => {
      if (targetState && !telegramLinked) {
        setError(
          <>
            Link your Telegram chat in {" "}
            <Link href="/account" className="underline text-sky-300">
              Account settings
            </Link>{" "}
            before enabling alerts.
          </>,
        );
        return;
      }

      notificationsBulkMutation.mutate(
        { notify: targetState },
        {
          onError: () => setError("Failed to update Telegram alerts."),
          onSuccess: () => setError(null),
        },
      );
    },
    [notificationsBulkMutation, telegramLinked],
  );

  const handleDelete = async (id: string) => {
    await savedLists.deleteMutation.mutateAsync(id);
  };

  const sharePath = useCallback((token: string) => `/collections/shared/${token}`, []);

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
        setError("Failed to copy share link.");
      }
    },
    [buildShareUrl],
  );

  const handleShare = useCallback(
    async (id: string, regenerate = false) => {
      try {
        setShareActionId(id);
        await shareMutation.mutateAsync({ id, regenerate });
        setError(null);
      } catch {
        setError(regenerate ? "Failed to regenerate share link." : "Failed to enable sharing.");
      } finally {
        setShareActionId(null);
      }
    },
    [shareMutation],
  );

  const handleUnshare = useCallback(
    async (id: string) => {
      try {
        setUnshareActionId(id);
        await unshareMutation.mutateAsync(id);
        setError(null);
      } catch {
        setError("Failed to disable sharing.");
      } finally {
        setUnshareActionId(null);
      }
    },
    [unshareMutation],
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">My Lists</h1>
            <p className="mt-2 text-sm text-slate-400">
              Manage every saved biomarker set, load it into the optimizer, or clean up old entries.
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
              ? "Saving…"
              : allNotificationsEnabled
                ? "Disable all alerts"
                : "Enable all alerts"}
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-10">
        {savedLists.listsQuery.isLoading || loadingTotals ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading lists…
          </div>
        ) : formattedLists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/70 px-6 py-8 text-center text-sm text-slate-400">
            No lists yet. Build a selection on the home page and press <span className="text-emerald-300">Save</span> to store it here.
          </div>
        ) : (
          <div className="grid gap-4">
            {formattedLists.map((item) => {
              const shareToken = item.list.share_token;
              const shareLink = shareToken ? buildShareUrl(shareToken) : null;
              const isSharePending = shareMutation.isPending && shareActionId === item.list.id;
              const isUnsharePending =
                unshareMutation.isPending && unshareActionId === item.list.id;
              const sharedTimestamp = item.list.shared_at ?? item.list.updated_at;
              const notifyPending =
                notificationsMutation.isPending &&
                notificationsMutation.variables?.id === item.list.id;
              const notificationsEnabled = item.list.notify_on_price_drop;

              return (
                <div
                  key={item.list.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-4 shadow-lg shadow-slate-900/40"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-white">{item.list.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.list.biomarkers.length} biomarker
                        {item.list.biomarkers.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 text-sm text-slate-300 md:flex-row md:items-center md:gap-6">
                      <div>
                        <span className="text-xs uppercase tracking-wide text-slate-500">Current total</span>
                        <p className="font-semibold text-white">{formatTotal(item)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleAlerts(item.list.id, notificationsEnabled)}
                          className="flex items-center gap-1 rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={notifyPending}
                        >
                          {notifyPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : notificationsEnabled ? (
                            <Bell className="h-4 w-4" />
                          ) : (
                            <BellOff className="h-4 w-4" />
                          )}
                          {notifyPending
                            ? "Saving…"
                            : notificationsEnabled
                              ? "Disable alerts"
                              : "Enable alerts"}
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/?list=${item.list.id}`)}
                          className="rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                        >
                          Load in optimizer
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.list.id)}
                          className="flex items-center gap-1 rounded-lg border border-red-500/60 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
                    {shareToken && shareLink ? (
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2 text-slate-400">
                            <LinkIcon className="h-4 w-4" />
                            <span className="font-semibold text-slate-200">Share link</span>
                          </span>
                          <span className="truncate font-mono text-sm text-slate-200">{shareLink}</span>
                          {sharedTimestamp && (
                            <span className="text-[11px] text-slate-500">
                              Updated {new Date(sharedTimestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyShare(shareToken, item.list.id)}
                            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {copiedId === item.list.id ? "Copied!" : "Copy link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleShare(item.list.id, true)}
                            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isSharePending}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            {isSharePending ? "Regenerating…" : "Regenerate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUnshare(item.list.id)}
                            className="flex items-center gap-1 rounded-lg border border-red-500/60 px-3 py-1.5 font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isUnsharePending}
                          >
                            {isUnsharePending ? "Disabling…" : "Disable share"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="text-slate-400">
                          Generate a shareable link to let others view this list without editing rights.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleShare(item.list.id)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/60 px-3 py-1.5 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSharePending}
                        >
                          {isSharePending ? "Generating…" : "Enable share"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
