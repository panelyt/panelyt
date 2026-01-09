"use client";

import { useMemo } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Header } from "../../../../../components/header";
import { useRouter } from "../../../../../i18n/navigation";
import { OptimizationResults } from "../../../../../components/optimization-results";
import { useSharedList } from "../../../../../hooks/useSharedList";
import { useOptimization, useAddonSuggestions } from "../../../../../hooks/useOptimization";
import { useBiomarkerSelection } from "../../../../../hooks/useBiomarkerSelection";

interface SharedContentProps {
  shareToken: string;
}

export default function SharedContent({ shareToken }: SharedContentProps) {
  const t = useTranslations();
  const router = useRouter();
  const sharedQuery = useSharedList(shareToken, Boolean(shareToken));
  const sharedList = sharedQuery.data;

  const sharedSelection = useMemo(
    () =>
      sharedList?.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })) ?? [],
    [sharedList],
  );
  const biomarkerCodes = useMemo(
    () => sharedSelection.map((entry) => entry.code),
    [sharedSelection],
  );
  const optimizationQuery = useOptimization(biomarkerCodes);
  const activeResult = optimizationQuery.data;
  const activeItemIds = useMemo(
    () => activeResult?.items?.map((item) => item.id) ?? [],
    [activeResult?.items],
  );
  const addonSuggestionsQuery = useAddonSuggestions(
    optimizationQuery.debouncedBiomarkers,
    activeItemIds,
    !optimizationQuery.isLoading,
  );
  const selection = useBiomarkerSelection();

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header />

      <div className="mx-auto max-w-5xl px-6 py-8">
        {sharedList ? (
          <div className="space-y-3">
            <p className="text-xs text-secondary">
              <span className="font-mono">shared/{shareToken}</span>
            </p>
            <h1 className="text-3xl font-semibold text-primary">{sharedList.name}</h1>
            <p className="text-xs text-secondary">
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
              {t("sharedList.shared")} {sharedList.shared_at ? new Date(sharedList.shared_at).toLocaleString("pl-PL") : ""}
            </p>
          </div>
        ) : sharedQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("sharedList.loadingList")}
          </div>
        ) : sharedQuery.isError ? (
          <p className="text-sm text-red-200">{t("sharedList.notFound")}</p>
        ) : null}
      </div>

      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pb-10">
        {sharedQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-surface-1/80 px-4 py-6 text-sm text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("sharedList.fetchingList")}
          </div>
        ) : sharedQuery.isError || !sharedList ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            {t("sharedList.invalidLink")}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="space-y-4 rounded-2xl border border-border/80 bg-surface-1/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    {t("sharedList.sharedBiomarkers")}
                  </p>
                  <h2 className="text-xl font-semibold text-primary">{t("sharedList.selectionOverview")}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/?shared=${shareToken}`)}
                  className="rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  {t("lists.loadInOptimizer")}
                </button>
              </div>
              <ul className="space-y-3 text-sm text-primary">
                {sharedList.biomarkers.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-border/80 bg-surface-2/60 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-primary">{entry.display_name}</span>
                    </div>
                    {entry.biomarker_id && (
                      <p className="text-xs text-secondary">{t("sharedList.mappedBiomarkerId")}: {entry.biomarker_id}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border/80 bg-surface-1/80 p-6">
              <h2 className="text-xl font-semibold text-primary">{t("sharedList.livePricing")}</h2>
              <p className="mt-2 text-sm text-secondary">
                {t("sharedList.livePricingDescription")}
              </p>
              <div className="mt-6">
                <OptimizationResults
                  selected={biomarkerCodes}
                  result={activeResult}
                  isLoading={optimizationQuery.isLoading}
                  error={optimizationQuery.error}
                  variant="dark"
                  addonSuggestions={addonSuggestionsQuery.data?.addon_suggestions ?? []}
                  addonSuggestionsLoading={addonSuggestionsQuery.isLoading}
                  onApplyAddon={selection.handleApplyAddon}
                />
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
