"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { OptimizationResults } from "../../../components/optimization-results";
import { useTemplateDetail } from "../../../hooks/useBiomarkerListTemplates";
import { useOptimization } from "../../../hooks/useOptimization";

interface TemplateDetailPageProps {
  params: Promise<{ slug: string }>;
}

export default function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const templateQuery = useTemplateDetail(slug, Boolean(slug));
  const template = templateQuery.data;

  const biomarkerCodes = useMemo(
    () => template?.biomarkers.map((entry) => entry.code) ?? [],
    [template],
  );
  const optimization = useOptimization(biomarkerCodes);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link
              href="/collections"
              className="flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <ArrowLeft className="h-3 w-3" /> Back to templates
            </Link>
            <span className="text-slate-600">/</span>
            <span className="font-mono">{slug}</span>
          </div>
          {template ? (
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold text-white">{template.name}</h1>
              {template.description && (
                <p className="max-w-2xl text-sm text-slate-300">{template.description}</p>
              )}
              <p className="text-xs text-slate-500">
                {template.biomarkers.length} biomarker
                {template.biomarkers.length === 1 ? "" : "s"} • Updated {new Date(template.updated_at).toLocaleString()}
              </p>
            </div>
          ) : templateQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading template…
            </div>
          ) : templateQuery.isError ? (
            <p className="text-sm text-red-200">Failed to load template.</p>
          ) : null}
        </div>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        {templateQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> Fetching template definition…
          </div>
        ) : templateQuery.isError || !template ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            We couldn&apos;t find that biomarker list. It may have been unpublished.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_3fr)]">
            <section className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Biomarkers
                  </p>
                  <h2 className="text-xl font-semibold text-white">Included markers</h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/?template=${template.slug}`)}
                  className="rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Load in optimizer
                </button>
              </div>
              <ul className="space-y-3 text-sm text-slate-200">
                {template.biomarkers.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{entry.display_name}</span>
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                        {entry.code}
                      </span>
                    </div>
                    {entry.biomarker && (
                      <p className="text-xs text-slate-400">
                        Matched biomarker: {entry.biomarker.name}
                        {entry.biomarker.elab_code ? ` · ELAB ${entry.biomarker.elab_code}` : ""}
                      </p>
                    )}
                    {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="text-xl font-semibold text-white">Latest pricing</h2>
              <p className="mt-2 text-sm text-slate-300">
                The optimizer runs automatically against diag.pl prices. Adjust the template in the
                main app to explore alternatives.
              </p>
              <div className="mt-6">
                <OptimizationResults
                  selected={biomarkerCodes}
                  result={optimization.data}
                  isLoading={optimization.isLoading}
                  error={optimization.error}
                />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
