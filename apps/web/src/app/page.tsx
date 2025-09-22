"use client";

import { useMemo, useState } from "react";
import { BarChart3, Clock, Layers, Sparkles } from "lucide-react";

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

  const heroStats = [
    {
      label: "Catalog items",
      value: meta ? meta.item_count.toLocaleString() : "—",
      hint: "Available tests right now",
      icon: <Layers className="h-4 w-4" />,
    },
    {
      label: "Biomarkers tracked",
      value: meta ? meta.biomarker_count.toLocaleString() : "—",
      hint: "Unique biomarkers in database",
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      label: "Snapshot coverage",
      value: meta ? `${Math.round(meta.percent_with_today_snapshot)}%` : "—",
      hint: "Items with today\'s prices",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      label: "Last refreshed",
      value: meta?.latest_fetched_at
        ? new Date(meta.latest_fetched_at).toLocaleString()
        : "—",
      hint: "Diag.pl sync timestamp",
      icon: <Clock className="h-4 w-4" />,
    },
  ];

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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.35), transparent 45%), radial-gradient(circle at 80% 10%, rgba(99,102,241,0.4), transparent 50%), radial-gradient(circle at 50% 80%, rgba(45,212,191,0.3), transparent 45%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200">Panelyt</p>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Optimize biomarkers testing
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-200 md:text-base">
            Panelyt optimizes biomarker selection for testing. It finds the best prices and combines tests into packages.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-12 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-900/30">
              <h2 className="text-lg font-semibold text-white">Build your biomarker set</h2>
              <div className="mt-6 flex flex-col gap-4">
                <SearchBox onSelect={handleSelect} />
                <SelectedBiomarkers biomarkers={selected} onRemove={handleRemove} />
              </div>
            </div>
          </div>

          <OptimizationResults
            selected={optimizerInput}
            result={optimization.data}
            isLoading={optimization.isFetching}
            error={optimization.error}
          />
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950/80 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-slate-200 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white">
                    {stat.icon}
                  </span>
                  {stat.label}
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{stat.value}</p>
                <p className="text-xs text-slate-300">{stat.hint}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Panelyt • Pricing intelligence for diagnostic panels</p>
        </div>
      </footer>
    </main>
  );
}
