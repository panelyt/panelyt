"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSavedLists } from "../../hooks/useSavedLists";
import { useUserSession } from "../../hooks/useUserSession";
import { useOptimization, useAddonSuggestions } from "../../hooks/useOptimization";
import { useBiomarkerSelection } from "../../hooks/useBiomarkerSelection";
import { useUrlParamSync } from "../../hooks/useUrlParamSync";
import { useUrlBiomarkerSync } from "../../hooks/useUrlBiomarkerSync";
import { useSaveListModal } from "../../hooks/useSaveListModal";
import { useTemplateModal } from "../../hooks/useTemplateModal";
import { usePanelHydrated } from "../../hooks/usePanelHydrated";
import { Header } from "../../components/header";
import { OptimizationResults } from "../../components/optimization-results";
import { OfficeSelectionBanner } from "../../components/office-selection-banner";
import { SearchBox } from "../../components/search-box";
import { SelectedBiomarkers } from "../../components/selected-biomarkers";
import { SaveListModal } from "../../components/save-list-modal";
import { TemplateModal } from "../../components/template-modal";
import { PanelActions } from "../../components/panel-actions";
import { OptimizerLayout } from "../../features/optimizer/OptimizerLayout";
import { StickySummaryBar } from "../../features/optimizer/StickySummaryBar";
import { dispatchSearchPrefill } from "../../features/optimizer/search-events";
import { track } from "../../lib/analytics";
import { requestAuthModal } from "../../lib/auth-events";
import { formatCurrency } from "../../lib/format";
import { buildOptimizationKey } from "../../lib/optimization";
import { usePanelStore } from "../../stores/panelStore";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { DIAG_NAME } from "../../lib/diag";

interface SummaryStatProps {
  label: string;
  value: string;
  valueTone?: string;
}

const SummaryStat = ({ label, value, valueTone }: SummaryStatProps) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-secondary">
      {label}
    </span>
    <span className={`text-base font-semibold ${valueTone ?? "text-primary"}`}>
      {value}
    </span>
  </div>
);


function HomeContent() {
  const t = useTranslations();
  const locale = useLocale();

  // Core data hooks
  const sessionQuery = useUserSession();
  const userSession = sessionQuery.data;
  const isAdmin = Boolean(userSession?.is_admin);

  // Biomarker selection
  const selection = useBiomarkerSelection();
  const setOptimizationSummary = usePanelStore((state) => state.setOptimizationSummary);
  const isPanelHydrated = usePanelHydrated();

  // Optimization
  const optimizationQuery = useOptimization(selection.biomarkerCodes);
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

  // Saved lists
  const savedLists = useSavedLists(Boolean(userSession));
  const savedListsData = useMemo(
    () => savedLists.listsQuery.data ?? [],
    [savedLists.listsQuery.data],
  );

  const [shareCopied, setShareCopied] = useState(false);
  const shareResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth callbacks for Header
  const handleAuthSuccess = useCallback(() => {
    selection.setError(null);
  }, [selection]);

  // Save list modal
  const saveListModal = useSaveListModal({
    isAuthenticated: Boolean(userSession),
    biomarkers: selection.selectionPayload,
    onExternalError: selection.setError,
    onRequireAuth: requestAuthModal,
  });

  // Template modal
  const templateModal = useTemplateModal({
    biomarkers: selection.selected,
  });

  const selectionKey = useMemo(
    () => buildOptimizationKey(selection.biomarkerCodes),
    [selection.biomarkerCodes],
  );

  const summary = useMemo(() => {
    if (!activeResult) {
      return null;
    }
    if (!selectionKey || !optimizationQuery.optimizationKey) {
      return null;
    }
    if (selectionKey !== optimizationQuery.optimizationKey) {
      return null;
    }

    const sourceName = DIAG_NAME;

    const totalNowLabel = formatCurrency(activeResult.total_now);
    const savingsAmount = Math.max(activeResult.total_now - activeResult.total_min30, 0);
    const savingsLabel =
      savingsAmount > 0 ? formatCurrency(savingsAmount) : t("optimization.atFloor");

    return {
      sourceName,
      totalNowLabel,
      savingsAmount,
      savingsLabel,
    };
  }, [
    activeResult,
    optimizationQuery.optimizationKey,
    selectionKey,
    t,
  ]);

  const summaryReady =
    summary !== null &&
    !optimizationQuery.isLoading &&
    !optimizationQuery.error;
  const selectionCount = selection.selected.length;
  const hasSelection = isPanelHydrated && selectionCount > 0;

  useEffect(() => {
    if (!activeResult) return;
    if (optimizationQuery.isLoading || optimizationQuery.error) return;
    if (!selectionKey || !optimizationQuery.optimizationKey) return;
    if (selectionKey !== optimizationQuery.optimizationKey) return;

    setOptimizationSummary({
      key: selectionKey,
      totalNow: activeResult.total_now,
      totalMin30: activeResult.total_min30,
      uncoveredCount: activeResult.uncovered?.length ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }, [
    activeResult,
    optimizationQuery.error,
    optimizationQuery.isLoading,
    optimizationQuery.optimizationKey,
    selectionKey,
    setOptimizationSummary,
  ]);

  // URL biomarker sync (two-way)
  const urlBiomarkerSync = useUrlBiomarkerSync({
    selected: selection.selected,
    onLoadFromUrl: useCallback(
      (biomarkers) => {
        selection.replaceAll(biomarkers);
      },
      [selection],
    ),
    skipSync: !isPanelHydrated,
    locale,
  });

  // Handle share button click
  const handleSharePanel = useCallback(async () => {
    const success = await urlBiomarkerSync.copyShareUrl();
    track("share_copy_url", { status: success ? "success" : "failure" });
    if (success) {
      toast(t("toast.shareCopied"));
      setShareCopied(true);
      if (shareResetTimeout.current) {
        clearTimeout(shareResetTimeout.current);
      }
      shareResetTimeout.current = setTimeout(() => {
        setShareCopied(false);
      }, 2000);
      return;
    }
    setShareCopied(false);
    toast(t("toast.shareCopyFailed"));
  }, [t, urlBiomarkerSync]);

  useEffect(() => {
    return () => {
      if (shareResetTimeout.current) {
        clearTimeout(shareResetTimeout.current);
      }
    };
  }, []);

  const shareButtonContent = shareCopied ? (
    <>
      <Check className="h-3.5 w-3.5" />
      {t("common.copied")}
    </>
  ) : (
    <>
      <Link2 className="h-3.5 w-3.5" />
      {t("common.share")}
    </>
  );

  const handleSaveList = useCallback(() => {
    saveListModal.open(
      selection.selected.length
        ? t("saveList.defaultName", { date: new Date().toLocaleDateString() })
        : "",
    );
  }, [saveListModal, selection.selected.length, t]);


  // URL parameter sync
  useUrlParamSync({
    onLoadTemplate: (biomarkers) => {
      selection.replaceAll(biomarkers);
    },
    onLoadShared: (biomarkers) => {
      selection.replaceAll(biomarkers);
    },
    onLoadList: (list) => {
      selection.replaceAll(
        list.biomarkers.map((entry) => ({
          code: entry.code,
          name: entry.display_name,
        })),
      );
    },
    onError: selection.setError,
    isAuthenticated: Boolean(userSession),
    onRequireAuth: requestAuthModal,
    savedLists: savedListsData,
    isFetchingSavedLists: savedLists.listsQuery.isFetching,
  });

  const handleTemplateSelect = useCallback(
    async (templateSelection: { slug: string; name: string }) => {
      await selection.handleTemplateSelect(templateSelection);
    },
    [selection],
  );

  const handleApplyAddon = useCallback(
    (biomarkers: { code: string; name: string }[], packageName: string) => {
      selection.handleApplyAddon(biomarkers, packageName);
    },
    [selection],
  );

  // Handle list selection from menu
  const handleLoadFromMenu = useCallback(
    (list: { biomarkers: { code: string; display_name: string }[] }) => {
      selection.handleLoadList(list as Parameters<typeof selection.handleLoadList>[0]);
    },
    [selection],
  );

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header
        onAuthSuccess={handleAuthSuccess}
        onLogoutError={selection.setError}
      />

      <SaveListModal
        open={saveListModal.isOpen}
        name={saveListModal.name}
        error={saveListModal.error}
        isSaving={saveListModal.isSaving}
        onNameChange={saveListModal.setName}
        onClose={saveListModal.close}
        onConfirm={saveListModal.handleConfirm}
      />

      <TemplateModal
        open={templateModal.isOpen}
        title={t("templateModal.publishTemplate")}
        submitLabel={templateModal.isSaving ? t("templateModal.saving") : t("templateModal.saveTemplate")}
        name={templateModal.name}
        slug={templateModal.slug}
        description={templateModal.description}
        isActive={templateModal.isActive}
        error={templateModal.error}
        isSubmitting={templateModal.isSaving}
        onNameChange={templateModal.setName}
        onSlugChange={templateModal.setSlug}
        onDescriptionChange={templateModal.setDescription}
        onIsActiveChange={templateModal.setIsActive}
        onClose={templateModal.close}
        onConfirm={templateModal.handleConfirm}
      />

      <section className="relative z-10 pb-16 pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
          <OptimizerLayout
            left={
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-primary">
                  {t("home.buildPanel")}
                </h2>
                <div className="mt-6 flex flex-col gap-4">
                  <OfficeSelectionBanner />
                  <SearchBox
                    onSelect={selection.handleSelect}
                    onTemplateSelect={handleTemplateSelect}
                  />
                  {isPanelHydrated ? (
                    <SelectedBiomarkers
                      biomarkers={selection.selected}
                      onRemove={selection.handleRemove}
                      onClearAll={selection.clearAll}
                    />
                  ) : (
                    <div
                      className="rounded-xl border border-dashed border-border/70 bg-surface-2/40 p-4 text-sm text-secondary"
                      aria-busy="true"
                    >
                      {t("common.loading")}
                    </div>
                  )}
                  {hasSelection && (
                    <p className="text-sm text-secondary">
                      {t("home.comparePrices")}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {selection.error && (
                    <p className="text-sm text-red-300">{selection.error}</p>
                  )}
                  <div className="ml-auto">
                    <PanelActions
                      isAdmin={isAdmin}
                      isPanelHydrated={isPanelHydrated}
                      selectionCount={selectionCount}
                      lists={savedListsData}
                      isLoadingLists={savedLists.listsQuery.isFetching}
                      onSave={handleSaveList}
                      onShare={() => void handleSharePanel()}
                      onLoad={handleLoadFromMenu}
                      onSaveTemplate={templateModal.open}
                      shareButtonContent={shareButtonContent}
                    />
                  </div>
                </div>
              </Card>
            }
            right={
              <>
                <StickySummaryBar
                  isVisible={hasSelection}
                  isLoading={optimizationQuery.isLoading}
                  source={
                    summaryReady ? (
                      <SummaryStat
                        label={t("optimization.sourceLabel")}
                        value={summary.sourceName}
                      />
                    ) : undefined
                  }
                  total={
                    summaryReady ? (
                      <SummaryStat
                        label={t("results.currentTotal")}
                        value={summary.totalNowLabel}
                      />
                    ) : undefined
                  }
                  savings={
                    summaryReady ? (
                      <SummaryStat
                        label={t("optimization.potentialSavings")}
                        value={summary.savingsLabel}
                        valueTone={
                          summary.savingsAmount > 0
                            ? "text-emerald-300"
                            : "text-secondary"
                        }
                      />
                    ) : undefined
                  }
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => void handleSharePanel()}
                        disabled={!isPanelHydrated || selection.selected.length === 0}
                      >
                        {shareButtonContent}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={handleSaveList}
                      >
                        {t("common.savePanel")}
                      </Button>
                    </>
                  }
                />
                {isPanelHydrated ? (
                  <OptimizationResults
                    selected={selection.biomarkerCodes}
                    result={activeResult}
                    isLoading={optimizationQuery.isLoading}
                    error={optimizationQuery.error ?? undefined}
                    variant="dark"
                    addonSuggestions={addonSuggestionsQuery.data?.addon_suggestions ?? []}
                    addonSuggestionsLoading={addonSuggestionsQuery.isLoading}
                    onApplyAddon={handleApplyAddon}
                    onRemoveFromPanel={selection.handleRemove}
                    onSearchAlternative={dispatchSearchPrefill}
                  />
                ) : (
                  <div
                    className="rounded-2xl border border-border/80 bg-surface-1/70 p-6 text-sm text-secondary"
                    aria-busy="true"
                  >
                    {t("common.loading")}
                  </div>
                )}
              </>
            }
          />
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
