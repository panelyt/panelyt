"use client";

import { use, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "../../../../i18n/navigation";
import { Header } from "../../../../components/header";
import { OptimizationResults } from "../../../../components/optimization-results";
import { useTemplateDetail } from "../../../../hooks/useBiomarkerListTemplates";
import { useOptimization } from "../../../../hooks/useOptimization";
import { usePanelStore } from "../../../../stores/panelStore";
import { track } from "../../../../lib/analytics";
import { Button } from "../../../../ui/button";
import { Card } from "../../../../ui/card";

interface TemplateDetailContentProps {
  params: Promise<{ slug: string }>;
}

export default function TemplateDetailContent({ params }: TemplateDetailContentProps) {
  const t = useTranslations();
  const { slug } = use(params);
  const router = useRouter();
  const templateQuery = useTemplateDetail(slug, Boolean(slug));
  const template = templateQuery.data;
  const addMany = usePanelStore((state) => state.addMany);
  const replaceAll = usePanelStore((state) => state.replaceAll);

  const biomarkerCodes = useMemo(
    () => template?.biomarkers.map((entry) => entry.code) ?? [],
    [template],
  );
  const optimization = useOptimization(biomarkerCodes, 'auto');

  const templateSelection = useMemo(
    () =>
      template?.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })) ?? [],
    [template],
  );

  const handleOpenOptimizer = () => {
    router.push("/");
  };

  const handleAddToPanel = () => {
    if (!template) {
      return;
    }
    addMany(templateSelection);
    track("panel_apply_template", { mode: "append" });
    toast(t("collections.appliedAppend", { name: template.name }), {
      action: {
        label: t("templateDetail.openOptimizer"),
        onClick: handleOpenOptimizer,
      },
    });
  };

  const handleReplacePanel = () => {
    if (!template) {
      return;
    }
    replaceAll(templateSelection);
    track("panel_apply_template", { mode: "replace" });
    toast(t("collections.appliedReplace", { name: template.name }), {
      action: {
        label: t("templateDetail.openOptimizer"),
        onClick: handleOpenOptimizer,
      },
    });
  };

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {template ? (
          <div className="space-y-4">
            <p className="text-xs text-secondary">
              <span className="font-mono">{slug}</span>
            </p>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-primary">{template.name}</h1>
                {template.description && (
                  <p className="max-w-2xl text-sm text-secondary">
                    {template.description}
                  </p>
                )}
                <p className="text-xs text-secondary">
                  {t("common.biomarkersCount", { count: template.biomarkers.length })} •{" "}
                  {t("common.updated")} {new Date(template.updated_at).toLocaleString("pl-PL")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" type="button" onClick={handleAddToPanel}>
                  {t("collections.addToPanel")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={handleReplacePanel}
                >
                  {t("collections.replacePanel")}
                </Button>
              </div>
            </div>
          </div>
        ) : templateQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("templateDetail.loadingTemplate")}
          </div>
        ) : templateQuery.isError ? (
          <p className="text-sm text-accent-red">{t("templateDetail.failedToLoad")}</p>
        ) : null}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-10">
        {templateQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-panel border border-border/70 bg-surface-1 px-4 py-6 text-sm text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("templateDetail.loadingTemplate")}
          </div>
        ) : templateQuery.isError || !template ? (
          <div className="rounded-panel border border-accent-red/40 bg-accent-red/10 px-4 py-6 text-sm text-accent-red">
            {t("templateDetail.notFound")}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_3fr)]">
            <Card className="flex flex-col gap-5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-emerald">
                    {t("templateDetail.biomarkers")}
                  </p>
                  <h2 className="text-xl font-semibold text-primary">
                    {t("templateDetail.includedMarkers")}
                  </h2>
                </div>
              </div>
              <ul className="space-y-3 text-sm text-primary">
                {template.biomarkers.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-primary">{entry.display_name}</span>
                    </div>
                    {entry.biomarker && (
                      <p className="text-xs text-secondary">
                        {t("templateDetail.matchedBiomarker")}: {entry.biomarker.name}
                      </p>
                    )}
                    {entry.notes && <p className="text-xs text-secondary">{entry.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold text-primary">
                {t("templateDetail.latestPricing")}
              </h2>
              <p className="mt-2 text-sm text-secondary">
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
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}
