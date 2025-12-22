"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";

import { Header } from "../../../../../components/header";
import { OptimizationResults } from "../../../../../components/optimization-results";
import { useSharedList } from "../../../../../hooks/useSharedList";
import { useOptimization } from "../../../../../hooks/useOptimization";

interface SharedListPageProps {
  params: Promise<{ shareToken: string }>;
}

export default function SharedListPage({ params }: SharedListPageProps) {
  const { shareToken } = use(params);
  const router = useRouter();
  const sharedQuery = useSharedList(shareToken, Boolean(shareToken));
  const sharedList = sharedQuery.data;

  const biomarkerCodes = useMemo(
    () => sharedList?.biomarkers.map((entry) => entry.code) ?? [],
    [sharedList],
  );
  const optimization = useOptimization(biomarkerCodes, 'auto');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-5xl px-6 py-8">
        {sharedList ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              <span className="font-mono">shared/{shareToken}</span>
            </p>
            <h1 className="text-3xl font-semibold text-white">{sharedList.name}</h1>
            <p className="text-xs text-slate-500">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              Shared {sharedList.shared_at ? new Date(sharedList.shared_at).toLocaleString() : "recently"}
            </p>
          </div>
        ) : sharedQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading shared list...
          </div>
        ) : sharedQuery.isError ? (
          <p className="text-sm text-red-200">Unable to find this shared list.</p>
        ) : null}
      </div>

      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pb-10">
        {sharedQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> Fetching shared list…
          </div>
        ) : sharedQuery.isError || !sharedList ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            This share link is no longer valid or has been revoked by its owner.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Shared biomarkers
                  </p>
                  <h2 className="text-xl font-semibold text-white">Selection overview</h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/?shared=${shareToken}`)}
                  className="rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Load in optimizer
                </button>
              </div>
              <ul className="space-y-3 text-sm text-slate-200">
                {sharedList.biomarkers.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{entry.display_name}</span>
                    </div>
                    {entry.biomarker_id && (
                      <p className="text-xs text-slate-400">Mapped biomarker ID: {entry.biomarker_id}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="text-xl font-semibold text-white">Live pricing</h2>
              <p className="mt-2 text-sm text-slate-300">
                Panelyt computes the cheapest basket for this shared list using the latest diag.pl
                prices.
              </p>
              <div className="mt-6">
                <OptimizationResults
                  selected={biomarkerCodes}
                  result={optimization.data}
                  isLoading={optimization.isLoading}
                  error={optimization.error}
                  variant="dark"
                />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
