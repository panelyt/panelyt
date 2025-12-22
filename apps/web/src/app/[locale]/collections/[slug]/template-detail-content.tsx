"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Header } from "../../../../components/header";
import { OptimizationResults } from "../../../../components/optimization-results";
import { useTemplateDetail } from "../../../../hooks/useBiomarkerListTemplates";
import { useOptimization } from "../../../../hooks/useOptimization";

interface TemplateDetailContentProps {
  params: Promise<{ slug: string }>;
}

export default function TemplateDetailContent({ params }: TemplateDetailContentProps) {
  const t = useTranslations();
  const { slug } = use(params);
  const router = useRouter();
  const templateQuery = useTemplateDetail(slug, Boolean(slug));
  const template = templateQuery.data;

  const biomarkerCodes = useMemo(
    () => template?.biomarkers.map((entry) => entry.code) ?? [],
    [template],
  );
  const optimization = useOptimization(biomarkerCodes, 'auto');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {template ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              <span className="font-mono">{slug}</span>
            </p>
            <h1 className="text-3xl font-semibold text-white">{template.name}</h1>
            {template.description && (
              <p className="max-w-2xl text-sm text-slate-300">{template.description}</p>
            )}
            <p className="text-xs text-slate-500">
              {template.biomarkers.length} {template.biomarkers.length === 1 ? t("common.biomarker") : t("common.biomarkers")} • {t("common.updated")} {new Date(template.updated_at).toLocaleString()}
            </p>
          </div>
        ) : templateQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("templateDetail.loadingTemplate")}
          </div>
        ) : templateQuery.isError ? (
          <p className="text-sm text-red-200">{t("templateDetail.failedToLoad")}</p>
        ) : null}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-10">
        {templateQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("templateDetail.loadingTemplate")}
          </div>
        ) : templateQuery.isError || !template ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            {t("templateDetail.notFound")}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_3fr)]">
            <section className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    {t("templateDetail.biomarkers")}
                  </p>
                  <h2 className="text-xl font-semibold text-white">{t("templateDetail.includedMarkers")}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/?template=${template.slug}`)}
                  className="rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  {t("lists.loadInOptimizer")}
                </button>
              </div>
              <ul className="space-y-3 text-sm text-slate-200">
                {template.biomarkers.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{entry.display_name}</span>
                    </div>
                    {entry.biomarker && (
                      <p className="text-xs text-slate-400">
                        {t("templateDetail.matchedBiomarker")}: {entry.biomarker.name}
                      </p>
                    )}
                    {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="text-xl font-semibold text-white">{t("templateDetail.latestPricing")}</h2>
              <p className="mt-2 text-sm text-slate-300">
                {t("templateDetail.pricingDescription")}
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
