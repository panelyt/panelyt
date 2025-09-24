"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Clock, Layers, Loader2, Sparkles } from "lucide-react";
import type { SavedList } from "@panelyt/types";

import { useCatalogMeta } from "../hooks/useCatalogMeta";
import { useOptimization } from "../hooks/useOptimization";
import { useSavedLists } from "../hooks/useSavedLists";
import { useUserSession } from "../hooks/useUserSession";
import { useAuth } from "../hooks/useAuth";
import { OptimizationResults } from "../components/optimization-results";
import { SearchBox } from "../components/search-box";
import { SelectedBiomarkers } from "../components/selected-biomarkers";
import { AuthModal } from "../components/auth-modal";
import { SaveListModal } from "../components/save-list-modal";
import { HttpError } from "../lib/http";

interface SelectedBiomarker {
  code: string;
  name: string;
}

export default function Home() {
  const [selected, setSelected] = useState<SelectedBiomarker[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [isSavingList, setIsSavingList] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoadMenuOpen, setIsLoadMenuOpen] = useState(false);

  const { data: meta } = useCatalogMeta();
  const sessionQuery = useUserSession();
  const auth = useAuth();
  const userSession = sessionQuery.data;
  const savedLists = useSavedLists(Boolean(userSession));
  const savedListsData = useMemo(() => savedLists.listsQuery.data ?? [], [savedLists.listsQuery.data]);

  const optimizerInput = useMemo(
    () => Array.from(new Set(selected.map((b) => b.code))),
    [selected],
  );
  const currentSelectionPayload = useMemo(
    () => selected.map((item) => ({ code: item.code, name: item.name })),
    [selected],
  );
  const optimization = useOptimization(optimizerInput);

  const loadMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isLoadMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (loadMenuRef.current && !loadMenuRef.current.contains(event.target as Node)) {
        setIsLoadMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isLoadMenuOpen]);

  const router = useRouter();

  const handleSelect = (biomarker: SelectedBiomarker) => {
    setSelected((current) => {
      const normalized = biomarker.code.trim();
      if (!normalized) return current;
      if (current.some((b) => b.code === normalized)) return current;
      return [...current, { code: normalized, name: biomarker.name }];
    });
  };

  const handleRemove = (code: string) => {
    setSelected((current) => current.filter((item) => item.code !== code));
  };

  const extractErrorMessage = (error: unknown) => {
    if (error instanceof HttpError) {
      if (error.body) {
        try {
          const parsed = JSON.parse(error.body);
          if (typeof parsed.detail === "string") {
            return parsed.detail;
          }
        } catch {
          // ignore parse failures
        }
      }
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Something went wrong";
  };

  const closeAuthModal = () => {
    setIsAuthOpen(false);
    setAuthError(null);
  };

  const openAuthModal = (mode: "login" | "register") => {
    setAuthMode(mode);
    setIsAuthOpen(true);
    setAuthError(null);
  };

  const handleLogin = async (credentials: { username: string; password: string }) => {
    try {
      setAuthError(null);
      await auth.loginMutation.mutateAsync(credentials);
      setSelected([]);
      await sessionQuery.refetch();
      closeAuthModal();
    } catch (error) {
      setAuthError(extractErrorMessage(error));
    }
  };

  const handleRegister = async (credentials: { username: string; password: string }) => {
    try {
      setAuthError(null);
      await auth.registerMutation.mutateAsync(credentials);
      setSelected([]);
      await sessionQuery.refetch();
      closeAuthModal();
    } catch (error) {
      setAuthError(extractErrorMessage(error));
    }
  };

  const handleLogout = async () => {
    try {
      await auth.logoutMutation.mutateAsync();
      setSelected([]);
      setListError(null);
      await sessionQuery.refetch();
      setAuthError(null);
    } catch (error) {
      setListError(extractErrorMessage(error));
    }
  };

  const handleLoadList = useCallback((list: SavedList) => {
    setSelected(list.biomarkers.map((entry) => ({ code: entry.code, name: entry.display_name })));
  }, []);

  const handleLoadFromMenu = (list: SavedList) => {
    handleLoadList(list);
    setIsLoadMenuOpen(false);
  };

  const saveList = async (name: string) => {
    if (selected.length === 0) {
      const message = "Add biomarkers before saving a list.";
      setListError(message);
      setSaveError(message);
      return;
    }
    setIsSavingList(true);
    try {
      await savedLists.createMutation.mutateAsync({
        name,
        biomarkers: currentSelectionPayload,
      });
      setListError(null);
      setSaveError(null);
    } catch (error) {
      const message = extractErrorMessage(error);
      setListError(message);
      setSaveError(message);
      throw error;
    } finally {
      setIsSavingList(false);
    }
  };

  const handleSaveConfirm = async () => {
    const trimmed = saveName.trim();
    if (!trimmed) {
      setSaveError("Name cannot be empty");
      return;
    }
    try {
      await saveList(trimmed);
      setIsSaveModalOpen(false);
      setSaveName("");
    } catch {
      // error state already set
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const listId = params.get("list");
    if (!listId) {
      return;
    }
    if (savedLists.listsQuery.isFetching) {
      return;
    }
    const match = savedListsData.find((item) => item.id === listId);
    if (match) {
      handleLoadList(match);
    }
    params.delete("list");
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }, [savedListsData, savedLists.listsQuery.isFetching, handleLoadList, router]);

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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <Link
          href="/lists"
          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          My Lists
        </Link>
        {userSession?.registered ? (
          <>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200">
              {userSession.username}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={auth.logoutMutation.isPending}
            >
              {auth.logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuthModal("register")}
              className="rounded-full border border-emerald-500/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              Register
            </button>
          </>
        )}
      </div>

      <AuthModal
        open={isAuthOpen}
        mode={authMode}
        onModeChange={(mode) => setAuthMode(mode)}
        onClose={closeAuthModal}
        onLogin={handleLogin}
        onRegister={handleRegister}
        isLoggingIn={auth.loginMutation.isPending}
        isRegistering={auth.registerMutation.isPending}
        error={authError}
      />

      <SaveListModal
        open={isSaveModalOpen}
        name={saveName}
        error={saveError}
        isSaving={isSavingList}
        onNameChange={setSaveName}
        onClose={() => {
          setIsSaveModalOpen(false);
          setSaveError(null);
        }}
        onConfirm={handleSaveConfirm}
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

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {listError && <p className="text-sm text-red-300">{listError}</p>}
                <div className="ml-auto flex items-center gap-2">
                  <div className="relative" ref={loadMenuRef}>
                    <button
                      type="button"
                      onClick={() => setIsLoadMenuOpen((open) => !open)}
                      className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
                    >
                      Load
                    </button>
                    {isLoadMenuOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900/95 p-3 shadow-xl shadow-slate-900/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Saved lists</p>
                        {savedLists.listsQuery.isFetching && (
                          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading…
                          </div>
                        )}
                        {!savedLists.listsQuery.isFetching && savedListsData.length === 0 && (
                          <p className="mt-3 text-xs text-slate-400">No saved lists yet.</p>
                        )}
                        <div className="mt-3 space-y-2">
                          {savedListsData.map((list) => (
                            <button
                              key={list.id}
                              type="button"
                              onClick={() => handleLoadFromMenu(list)}
                              className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
                            >
                              <span className="font-semibold">{list.name}</span>
                              <span className="text-[11px] text-slate-400">
                                {list.biomarkers.length} biomarker{list.biomarkers.length === 1 ? "" : "s"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSaveName(selected.length ? `List ${new Date().toLocaleDateString()}` : "");
                      setSaveError(null);
                      setIsSaveModalOpen(true);
                    }}
                    className="rounded-full border border-emerald-500/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                  >
                    Save
                  </button>
                </div>
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
