"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { Link2, Check } from "lucide-react";

import { useSavedLists } from "../hooks/useSavedLists";
import { useUserSession } from "../hooks/useUserSession";
import { useLabOptimization } from "../hooks/useLabOptimization";
import { useBiomarkerSelection } from "../hooks/useBiomarkerSelection";
import { useUrlParamSync } from "../hooks/useUrlParamSync";
import { useUrlBiomarkerSync } from "../hooks/useUrlBiomarkerSync";
import { useSaveListModal } from "../hooks/useSaveListModal";
import { useTemplateModal } from "../hooks/useTemplateModal";
import { Header } from "../components/header";
import { OptimizationResults } from "../components/optimization-results";
import { SearchBox } from "../components/search-box";
import { SelectedBiomarkers } from "../components/selected-biomarkers";
import { SaveListModal } from "../components/save-list-modal";
import { TemplateModal } from "../components/template-modal";
import { AddonSuggestionsPanel } from "../components/addon-suggestions-panel";
import { LoadMenu } from "../components/load-menu";

function HomeContent() {
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
    selection.setSelected([]);
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
        selection.setSelected(biomarkers);
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
      selection.setSelected(biomarkers);
      labOptimization.resetLabChoice();
    },
    onLoadShared: (biomarkers) => {
      selection.setSelected(biomarkers);
      labOptimization.resetLabChoice();
    },
    onLoadList: (list) => {
      selection.handleLoadList(list);
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
        title="Publish curated template"
        submitLabel={templateModal.isSaving ? "Saving…" : "Save template"}
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

      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.35), transparent 45%), radial-gradient(circle at 80% 10%, rgba(99,102,241,0.4), transparent 50%), radial-gradient(circle at 50% 80%, rgba(45,212,191,0.3), transparent 45%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-200">
            Panelyt
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            Optimize biomarkers testing
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-200 md:text-base">
            Panelyt optimizes biomarker selection for testing. It finds the best
            prices and combines tests into packages.
          </p>
        </div>
      </section>

      <section className="relative z-10 -mt-12 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
          <div className="grid gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-900/30">
              <h2 className="text-lg font-semibold text-white">
                Build your biomarker set
              </h2>
              <div className="mt-6 flex flex-col gap-4">
                <SearchBox
                  onSelect={selection.handleSelect}
                  onTemplateSelect={handleTemplateSelect}
                />
                <SelectedBiomarkers
                  biomarkers={selection.selected}
                  onRemove={selection.handleRemove}
                />
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

                  <button
                    type="button"
                    onClick={() =>
                      saveListModal.open(
                        selection.selected.length
                          ? `List ${new Date().toLocaleDateString()}`
                          : "",
                      )
                    }
                    className="rounded-full border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSharePanel()}
                    disabled={selection.selected.length === 0}
                    className="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shareCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" />
                        Share
                      </>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={templateModal.open}
                      className="rounded-full border border-sky-500/60 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
                    >
                      Save as template
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {labOptimization.activeResult && (
            <AddonSuggestionsPanel
              suggestions={labOptimization.addonSuggestions}
              onApply={handleApplyAddon}
              isLoading={labOptimization.addonSuggestionsLoading}
            />
          )}

          <OptimizationResults
            selected={selection.biomarkerCodes}
            result={labOptimization.activeResult}
            isLoading={labOptimization.activeLoading}
            error={labOptimization.activeError ?? undefined}
            variant="dark"
            labCards={labOptimization.labCards}
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
