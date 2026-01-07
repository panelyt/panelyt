"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSavedLists } from "../../hooks/useSavedLists";
import { useUserSession } from "../../hooks/useUserSession";
import { useLabOptimization } from "../../hooks/useLabOptimization";
import { useBiomarkerSelection } from "../../hooks/useBiomarkerSelection";
import { useUrlParamSync } from "../../hooks/useUrlParamSync";
import { useUrlBiomarkerSync } from "../../hooks/useUrlBiomarkerSync";
import { useSaveListModal } from "../../hooks/useSaveListModal";
import { useTemplateModal } from "../../hooks/useTemplateModal";
import { Header } from "../../components/header";
import { OptimizationResults } from "../../components/optimization-results";
import { SearchBox } from "../../components/search-box";
import { SelectedBiomarkers } from "../../components/selected-biomarkers";
import { SaveListModal } from "../../components/save-list-modal";
import { TemplateModal } from "../../components/template-modal";
import { LoadMenu } from "../../components/load-menu";
import { OptimizerLayout } from "../../features/optimizer/OptimizerLayout";
import { StickySummaryBar } from "../../features/optimizer/StickySummaryBar";
import { dispatchSearchPrefill } from "../../features/optimizer/search-events";
import { track } from "../../lib/analytics";
import { formatCurrency } from "../../lib/format";
import { buildOptimizationKey } from "../../lib/optimization";
import { usePanelStore } from "../../stores/panelStore";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface SummaryStatProps {
  label: string;
  value: string;
  valueTone?: string;
}

const SummaryStat = ({ label, value, valueTone }: SummaryStatProps) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {label}
    </span>
    <span className={`text-base font-semibold ${valueTone ?? "text-white"}`}>
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

  // Lab optimization
  const labOptimization = useLabOptimization(selection.biomarkerCodes);

  // Saved lists
  const savedLists = useSavedLists(Boolean(userSession));
  const savedListsData = useMemo(
    () => savedLists.listsQuery.data ?? [],
    [savedLists.listsQuery.data],
  );

  // Auth callbacks for Header
  const handleAuthSuccess = useCallback(() => {
    selection.replaceAll([]);
    selection.setError(null);
  }, [selection]);

  // Save list modal
  const saveListModal = useSaveListModal({
    isAuthenticated: Boolean(userSession),
    biomarkers: selection.selectionPayload,
    onExternalError: selection.setError,
  });

  // Template modal
  const templateModal = useTemplateModal({
    biomarkers: selection.selected,
  });

  const summary = useMemo(() => {
    if (!labOptimization.activeResult) {
      return null;
    }

    const activeResult = labOptimization.activeResult;
    const activeLabCard =
      labOptimization.labCards.find((card) => card.active) ??
      labOptimization.labCards[0];

    let bestLabLabel = "";
    if (activeResult.mode === "split") {
      bestLabLabel = t("optimization.bothLabs");
    } else if (activeLabCard?.shortLabel) {
      bestLabLabel = activeLabCard.shortLabel;
    } else if (activeLabCard?.title) {
      bestLabLabel = activeLabCard.title;
    } else if (activeResult.lab_name) {
      bestLabLabel = activeResult.lab_name;
    } else if (activeResult.lab_code) {
      bestLabLabel = activeResult.lab_code.toUpperCase();
    } else {
      bestLabLabel = t("optimization.labFallback");
    }

    const totalNowLabel = formatCurrency(activeResult.total_now);
    const savingsAmount = Math.max(activeResult.total_now - activeResult.total_min30, 0);
    const savingsLabel =
      savingsAmount > 0 ? formatCurrency(savingsAmount) : t("optimization.atFloor");

    return {
      bestLabLabel,
      totalNowLabel,
      savingsAmount,
      savingsLabel,
    };
  }, [labOptimization.activeResult, labOptimization.labCards, t]);

  const summaryReady =
    summary !== null &&
    !labOptimization.activeLoading &&
    !labOptimization.activeError;

  const selectionKey = useMemo(
    () => buildOptimizationKey(selection.biomarkerCodes),
    [selection.biomarkerCodes],
  );

  useEffect(() => {
    if (!labOptimization.activeResult) return;
    if (labOptimization.activeLoading || labOptimization.activeError) return;
    if (!selectionKey || !labOptimization.optimizationKey) return;
    if (selectionKey !== labOptimization.optimizationKey) return;

    const activeResult = labOptimization.activeResult;
    const activeLabCard =
      labOptimization.labCards.find((card) => card.active) ??
      labOptimization.labCards[0];
    const labCode =
      activeResult.lab_code ||
      activeLabCard?.shortLabel ||
      activeLabCard?.title ||
      activeResult.lab_name ||
      "lab";

    setOptimizationSummary({
      key: selectionKey,
      labCode,
      totalNow: activeResult.total_now,
      totalMin30: activeResult.total_min30,
      uncoveredCount: activeResult.uncovered?.length ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }, [
    labOptimization.activeError,
    labOptimization.activeLoading,
    labOptimization.activeResult,
    labOptimization.labCards,
    labOptimization.optimizationKey,
    selectionKey,
    setOptimizationSummary,
  ]);

  // URL biomarker sync (two-way)
  const urlBiomarkerSync = useUrlBiomarkerSync({
    selected: selection.selected,
    onLoadFromUrl: useCallback(
      (biomarkers) => {
        selection.replaceAll(biomarkers);
        labOptimization.resetLabChoice();
      },
      [selection, labOptimization],
    ),
    locale,
  });

  // Handle share button click
  const handleSharePanel = useCallback(async () => {
    const success = await urlBiomarkerSync.copyShareUrl();
    track("share_copy_url", { status: success ? "success" : "failure" });
    if (success) {
      toast(t("toast.shareCopied"));
      return;
    }
    toast(t("toast.shareCopyFailed"));
  }, [t, urlBiomarkerSync]);

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
      labOptimization.resetLabChoice();
    },
    onLoadShared: (biomarkers) => {
      selection.replaceAll(biomarkers);
      labOptimization.resetLabChoice();
    },
    onLoadList: (list) => {
      selection.replaceAll(
        list.biomarkers.map((entry) => ({
          code: entry.code,
          name: entry.display_name,
        })),
      );
      labOptimization.resetLabChoice();
    },
    onError: selection.setError,
    savedLists: savedListsData,
    isFetchingSavedLists: savedLists.listsQuery.isFetching,
  });

  // Wrap template select to reset lab choice
  const handleTemplateSelect = useCallback(
    async (templateSelection: { slug: string; name: string }) => {
      await selection.handleTemplateSelect(templateSelection);
      labOptimization.resetLabChoice();
    },
    [selection, labOptimization],
  );

  // Wrap addon apply to reset lab choice
  const handleApplyAddon = useCallback(
    (biomarkers: { code: string; name: string }[], packageName: string) => {
      selection.handleApplyAddon(biomarkers, packageName);
      labOptimization.resetLabChoice();
    },
    [selection, labOptimization],
  );

  // Handle list selection from menu
  const handleLoadFromMenu = useCallback(
    (list: { biomarkers: { code: string; display_name: string }[] }) => {
      selection.handleLoadList(list as Parameters<typeof selection.handleLoadList>[0]);
      labOptimization.resetLabChoice();
    },
    [selection, labOptimization],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
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
                <h2 className="text-lg font-semibold text-white">
                  {t("home.buildPanel")}
                </h2>
                <div className="mt-6 flex flex-col gap-4">
                  <SearchBox
                    onSelect={selection.handleSelect}
                    onTemplateSelect={handleTemplateSelect}
                  />
                  <SelectedBiomarkers
                    biomarkers={selection.selected}
                    onRemove={selection.handleRemove}
                    onClearAll={selection.clearAll}
                  />
                  {selection.selected.length > 0 && (
                    <p className="text-sm text-slate-400">
                      {t("home.comparePrices")}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {selection.error && (
                    <p className="text-sm text-red-300">{selection.error}</p>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <LoadMenu
                      lists={savedListsData}
                      isLoading={savedLists.listsQuery.isFetching}
                      onSelect={handleLoadFromMenu}
                    />

                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      onClick={handleSaveList}
                    >
                      {t("common.save")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => void handleSharePanel()}
                      disabled={selection.selected.length === 0}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {t("common.share")}
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={templateModal.open}
                      >
                        {t("home.saveAsTemplate")}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            }
            right={
              <>
                <StickySummaryBar
                  isVisible={selection.selected.length > 0}
                  isLoading={labOptimization.activeLoading}
                  bestLab={
                    summaryReady ? (
                      <SummaryStat
                        label={t("optimization.bestPrices")}
                        value={summary.bestLabLabel}
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
                            : "text-slate-300"
                        }
                      />
                    ) : undefined
                  }
                  actions={
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={handleSaveList}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => void handleSharePanel()}
                        disabled={selection.selected.length === 0}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {t("common.share")}
                      </Button>
                    </>
                  }
                />
                <OptimizationResults
                  selected={selection.biomarkerCodes}
                  result={labOptimization.activeResult}
                  isLoading={labOptimization.activeLoading}
                  error={labOptimization.activeError ?? undefined}
                  variant="dark"
                  labCards={labOptimization.labCards}
                  addonSuggestions={labOptimization.addonSuggestions}
                  addonSuggestionsLoading={labOptimization.addonSuggestionsLoading}
                  onApplyAddon={handleApplyAddon}
                  onRemoveFromPanel={selection.handleRemove}
                  onSearchAlternative={dispatchSearchPrefill}
                />
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
