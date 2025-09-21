"use client";

import { useMemo, useState } from "react";
import { useCatalogMeta } from "../hooks/useCatalogMeta";
import { useOptimization } from "../hooks/useOptimization";
import { OptimizationResults } from "../components/optimization-results";
import { SearchBox } from "../components/search-box";
import { SelectedBiomarkers } from "../components/selected-biomarkers";

interface SelectedBiomarker {
  code: string;
  name: string;
}

export default function Home() {
  const [selected, setSelected] = useState<SelectedBiomarker[]>([]);
  const { data: meta } = useCatalogMeta();

  const optimizerInput = useMemo(() =>
    Array.from(new Set(selected.map(b => b.code))),
    [selected]
  );
  const optimization = useOptimization(optimizerInput);

  const handleSelect = (biomarker: SelectedBiomarker) => {
    setSelected((current) => {
      const normalized = biomarker.code.trim();
      if (!normalized) return current;
      if (current.some(b => b.code === normalized)) return current;
      return [...current, { code: normalized, name: biomarker.name }];
    });
  };

  const handleRemove = (code: string) => {
    setSelected((current) => current.filter((item) => item.code !== code));
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pt-12">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase text-brand">Panelyt</p>
          <h1 className="text-3xl font-semibold text-slate-900">
            Find the cheapest mix of blood tests for your biomarkers.
          </h1>
          <p className="text-sm text-slate-500">
            Pulls live prices from diag.pl, keeps daily history for 30 days, and compares current
            costs with Panelyt&apos;s 30-day minimum basket.
          </p>
          {meta && (
            <p className="text-xs uppercase text-slate-400">
              Catalog: {meta.item_count} items · {meta.biomarker_count} biomarkers · Latest fetch
              {" "}
              {meta.latest_fetched_at ? new Date(meta.latest_fetched_at).toLocaleString() : "—"}
            </p>
          )}
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <SearchBox onSelect={handleSelect} />
            <SelectedBiomarkers biomarkers={selected} onRemove={handleRemove} />
          </div>
        </section>

        <OptimizationResults
          selected={optimizerInput}
          result={optimization.data}
          isLoading={optimization.isFetching}
          error={optimization.error}
        />
      </div>
    </main>
  );
}
