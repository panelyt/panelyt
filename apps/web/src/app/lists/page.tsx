"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { SavedList } from "@panelyt/types";

import { useSavedLists } from "../../hooks/useSavedLists";
import { useUserSession } from "../../hooks/useUserSession";
import { postJson } from "../../lib/http";
import { OptimizeResponseSchema } from "@panelyt/types";

interface ListWithTotals {
  list: SavedList;
  total: number | null;
  currency: string | null;
}

export default function ListsPage() {
  const session = useUserSession();
  const savedLists = useSavedLists(Boolean(session.data));
  const rawLists = savedLists.listsQuery.data;
  const router = useRouter();
  const [listsWithTotals, setListsWithTotals] = useState<Record<string, ListWithTotals>>({});
  const [loadingTotals, setLoadingTotals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const lists = rawLists ?? [];
    if (!lists.length) {
      setListsWithTotals({});
      return;
    }

    let cancelled = false;
    setLoadingTotals(true);
    setError(null);

    const fetchTotals = async () => {
      try {
        const results = await Promise.all(
          lists.map(async (list) => {
            if (list.biomarkers.length === 0) {
              return [list.id, { list, total: 0, currency: "PLN" }] as const;
            }
            try {
              const payload = await postJson("/optimize", {
                biomarkers: list.biomarkers.map((entry) => entry.code),
              });
              const parsed = OptimizeResponseSchema.parse(payload);
              return [
                list.id,
                { list, total: parsed.total_now, currency: parsed.currency },
              ] as const;
            } catch {
              return [list.id, { list, total: null, currency: null }] as const;
            }
          }),
        );

        if (!cancelled) {
          const map: Record<string, ListWithTotals> = {};
          for (const [id, value] of results) {
            map[id] = value;
          }
          setListsWithTotals(map);
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
    return lists.map((list) => listsWithTotals[list.id] ?? { list, total: null, currency: null });
  }, [rawLists, listsWithTotals]);

  const handleDelete = async (id: string) => {
    await savedLists.deleteMutation.mutateAsync(id);
  };

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
      <header className="border-b border-slate-800 bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">Panelyt</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">My Lists</h1>
              <p className="mt-2 text-sm text-slate-400">
                Manage every saved biomarker set, load it into the optimizer, or clean up old entries.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-emerald-500/60 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Back to optimizer
            </Link>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
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
            {formattedLists.map((item) => (
              <div
                key={item.list.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-4 shadow-lg shadow-slate-900/40 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-lg font-semibold text-white">{item.list.name}</p>
                  <p className="text-xs text-slate-400">
                    {item.list.biomarkers.length} biomarker{item.list.biomarkers.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 text-sm text-slate-300 md:flex-row md:items-center md:gap-6">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-slate-500">Current total</span>
                    <p className="font-semibold text-white">{formatTotal(item)}</p>
                  </div>
                  <div className="flex gap-2">
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
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
