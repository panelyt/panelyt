"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Link2, Check } from "lucide-react";
import { useTranslations } from "next-intl";

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
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

function HomeContent() {
  const t = useTranslations();

  // Core data hooks
  const sessionQuery = useUserSession();
  const userSession = sessionQuery.data;
  const isAdmin = Boolean(userSession?.is_admin);

  // Biomarker selection
  const selection = useBiomarkerSelection();

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

  // Share URL state
  const [shareCopied, setShareCopied] = useState(false);

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
  });

  // Handle share button click
  const handleSharePanel = useCallback(async () => {
    const success = await urlBiomarkerSync.copyShareUrl();
    if (success) {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }, [urlBiomarkerSync]);

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
                  {selection.notice && (
                    <p
                      className={`text-sm ${
                        selection.notice.tone === "success"
                          ? "text-emerald-300"
                          : "text-slate-300"
                      }`}
                    >
                      {selection.notice.message}
                    </p>
                  )}
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
                      onClick={() =>
                        saveListModal.open(
                          selection.selected.length
                            ? t("saveList.defaultName", {
                                date: new Date().toLocaleDateString(),
                              })
                            : "",
                        )
                      }
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
                      {shareCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          {t("common.copied")}
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5" />
                          {t("common.share")}
                        </>
                      )}
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
                <StickySummaryBar isVisible={selection.selected.length > 0} />
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
