"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Clock,
  Factory,
  FlaskConical,
  Layers,
  Loader2,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  BiomarkerListTemplateSchema,
  OptimizeResponseSchema,
  SavedListSchema,
  type LabAvailability,
  type SavedList,
} from "@panelyt/types";

import { useCatalogMeta } from "../hooks/useCatalogMeta";
import { useOptimization } from "../hooks/useOptimization";
import { useQueries } from "@tanstack/react-query";
import { useSavedLists } from "../hooks/useSavedLists";
import { useUserSession } from "../hooks/useUserSession";
import { useAuth } from "../hooks/useAuth";
import { useTemplateAdmin } from "../hooks/useTemplateAdmin";
import { OptimizationResults } from "../components/optimization-results";
import { SearchBox } from "../components/search-box";
import { SelectedBiomarkers } from "../components/selected-biomarkers";
import { AuthModal } from "../components/auth-modal";
import { SaveListModal } from "../components/save-list-modal";
import { TemplateModal } from "../components/template-modal";
import { HttpError, getJson, postJson } from "../lib/http";
import { formatCurrency } from "../lib/format";
import { slugify } from "../lib/slug";

interface SelectedBiomarker {
  code: string;
  name: string;
}

export default function Home() {
  const [selected, setSelected] = useState<SelectedBiomarker[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<
    { tone: "success" | "info"; message: string } | null
  >(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [isSavingList, setIsSavingList] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoadMenuOpen, setIsLoadMenuOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSlug, setTemplateSlug] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateIsActive, setTemplateIsActive] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSlugTouched, setTemplateSlugTouched] = useState(false);
  const [selectedLabChoice, setSelectedLabChoice] = useState<string | "all" | null>(null);
  const [cachedLabOptions, setCachedLabOptions] = useState<LabAvailability[]>([]);
  const autoSelectionRef = useRef<string | null>(null);

  const { data: meta } = useCatalogMeta();
  const sessionQuery = useUserSession();
  const auth = useAuth();
  const userSession = sessionQuery.data;
  const savedLists = useSavedLists(Boolean(userSession));
  const savedListsData = useMemo(() => savedLists.listsQuery.data ?? [], [savedLists.listsQuery.data]);
  const templateAdmin = useTemplateAdmin();
  const isAdmin = Boolean(userSession?.is_admin);

  const optimizerInput = useMemo(
    () => Array.from(new Set(selected.map((b) => b.code))),
    [selected],
  );
  const currentSelectionPayload = useMemo(
    () => selected.map((item) => ({ code: item.code, name: item.name })),
    [selected],
  );
  const autoOptimization = useOptimization(optimizerInput, "auto");
  const splitOptimization = useOptimization(optimizerInput, "split");

  const latestLabOptions = autoOptimization.data?.lab_options;
  const labOptions = latestLabOptions ?? cachedLabOptions;

  useEffect(() => {
    if (latestLabOptions !== undefined) {
      setCachedLabOptions(latestLabOptions);
    }
    if (optimizerInput.length === 0) {
      setCachedLabOptions([]);
      setSelectedLabChoice(null);
      autoSelectionRef.current = null;
    }
  }, [latestLabOptions, optimizerInput.length]);

  const autoLabCode = autoOptimization.data?.lab_code ?? null;

  const primaryLabCodes = useMemo(() => {
    const codes: string[] = [];
    if (autoLabCode) {
      codes.push(autoLabCode);
    }
    for (const option of labOptions) {
      if (option.code && !codes.includes(option.code)) {
        codes.push(option.code);
      }
      if (codes.length >= 2) {
        break;
      }
    }
    return codes.slice(0, 2);
  }, [autoLabCode, labOptions]);

  const optimizationKey = useMemo(
    () => optimizerInput.map((item) => item.toLowerCase()).sort().join("|"),
    [optimizerInput],
  );

  const labComparisons = useQueries({
    queries: primaryLabCodes.map((code) => ({
      queryKey: ["optimize", optimizationKey, "single_lab", code],
      queryFn: async () => {
        const payload = await postJson("/optimize", {
          biomarkers: optimizerInput,
          mode: "single_lab",
          lab_code: code,
        });
        return OptimizeResponseSchema.parse(payload);
      },
      enabled: optimizerInput.length > 0 && Boolean(code),
    })),
  });

  const defaultSingleLabCode = (() => {
    if (optimizerInput.length === 0 || primaryLabCodes.length === 0) {
      return null;
    }

    let best: { code: string; covered: number; price: number } | null = null;

    for (let index = 0; index < primaryLabCodes.length; index += 1) {
      const code = primaryLabCodes[index];
      const option = labOptions.find((lab) => lab.code === code);
      const missingCount = option?.missing_tokens?.length ?? optimizerInput.length;
      const covered = Math.max(optimizerInput.length - missingCount, 0);
      const query = labComparisons[index];
      const price = query?.data?.total_now ?? Number.POSITIVE_INFINITY;
      const candidate = { code, covered, price };

      if (best === null) {
        best = candidate;
        continue;
      }

      if (candidate.covered > best.covered) {
        best = candidate;
        continue;
      }

      if (candidate.covered === best.covered && candidate.price < best.price) {
        best = candidate;
      }
    }

    return best?.code ?? null;
  })();

  useEffect(() => {
    if (optimizerInput.length === 0 || primaryLabCodes.length === 0) {
      setSelectedLabChoice(null);
      autoSelectionRef.current = null;
      return;
    }

    const nextChoice = defaultSingleLabCode ?? primaryLabCodes[0] ?? null;

    if (!nextChoice) {
      return;
    }

    setSelectedLabChoice((current) => {
      if (current === "all") {
        autoSelectionRef.current = null;
        return current;
      }

      const isCurrentValid = (current && primaryLabCodes.includes(current)) || false;

      if (isCurrentValid && autoSelectionRef.current === null) {
        return current;
      }

      if (isCurrentValid && current === nextChoice) {
        autoSelectionRef.current = nextChoice;
        return current;
      }

      autoSelectionRef.current = nextChoice;
      return nextChoice;
    });
  }, [defaultSingleLabCode, optimizerInput.length, primaryLabCodes]);

  const splitResult = splitOptimization.data;
  const splitLoading = splitOptimization.isLoading || splitOptimization.isFetching;
  const splitError =
    splitOptimization.error instanceof Error ? splitOptimization.error : null;

  const autoLoading = autoOptimization.isLoading || autoOptimization.isFetching;
  const autoError =
    autoOptimization.error instanceof Error ? autoOptimization.error : null;

  const resolvedSingleCode =
    selectedLabChoice && selectedLabChoice !== "all"
      ? selectedLabChoice
      : primaryLabCodes[0] ?? autoLabCode;

  const activeSingleIndex = resolvedSingleCode
    ? primaryLabCodes.indexOf(resolvedSingleCode)
    : -1;
  const activeSingleQuery =
    activeSingleIndex >= 0 ? labComparisons[activeSingleIndex] : undefined;

  const singleResult = activeSingleQuery?.data ?? autoOptimization.data;
  const singleLoading = activeSingleQuery
    ? activeSingleQuery.isLoading || activeSingleQuery.isFetching
    : autoLoading;
  const singleError = activeSingleQuery?.error instanceof Error
    ? activeSingleQuery.error
    : autoError;

  const activeResult = selectedLabChoice === "all"
    ? splitResult ?? (singleResult ? { ...singleResult, mode: "split" } : undefined)
    : singleResult;
  const activeLoading = selectedLabChoice === "all"
    ? splitLoading || (!splitResult && singleLoading)
    : singleLoading;
  const activeError = selectedLabChoice === "all"
    ? splitError ?? singleError
    : singleError;

  const labelForLab = useCallback((code: string, name?: string | null) => {
    const normalizedCode = (code || "").trim().toLowerCase();
    const normalizedName = (name || "").trim().toLowerCase();
    if (normalizedCode === "diag" || normalizedName.includes("diag")) {
      return "DIAG";
    }
    if (normalizedCode === "alab" || normalizedName.includes("alab")) {
      return "ALAB";
    }
    const fallback = (code || name || "Lab").trim();
    return fallback ? fallback.toUpperCase() : "LAB";
  }, []);

  const labCards = useMemo(() => {
    if (primaryLabCodes.length === 0) {
      return [];
    }

    let cards = primaryLabCodes.map((code, index) => {
      const query = labComparisons[index];
      const option = labOptions.find((lab) => lab.code === code);
      const labShort = labelForLab(code, option?.name ?? query.data?.lab_name);
      const labTitle = `ONLY ${labShort}`;
      const priceLabel = query.data ? formatCurrency(query.data.total_now) : "—";
      const missingTokensCount = option?.missing_tokens?.length ?? 0;
      const hasGaps = option ? !option.covers_all && missingTokensCount > 0 : false;
      const uncoveredTotal = query.data ? query.data.uncovered.length : 0;
      const missingCount = hasGaps ? missingTokensCount : uncoveredTotal;
      const bonusCount = query.data
        ? query.data.items.reduce(
            (acc, item) =>
              acc + item.biomarkers.filter((token) => !optimizerInput.includes(token)).length,
            0,
          )
        : 0;
      const hasCounts = optimizerInput.length > 0 && (query.data || missingTokensCount > 0 || bonusCount > 0);
      const coverageLabel = !hasCounts
        ? optimizerInput.length === 0
          ? "Add biomarkers to compare labs"
          : "—"
        : `${missingCount} Missing · ${bonusCount} Bonus`;

      const preset: { icon: ReactNode; accentLight: string; accentDark: string } = (() => {
        switch (labShort) {
          case "DIAG":
            return {
              icon: <FlaskConical className="h-4 w-4" />,
              accentLight: "bg-emerald-500/10 text-emerald-600",
              accentDark: "bg-emerald-500/20 text-emerald-200",
            } as const;
          case "ALAB":
            return {
              icon: <Factory className="h-4 w-4" />,
              accentLight: "bg-sky-500/10 text-sky-500",
              accentDark: "bg-sky-500/20 text-sky-200",
            } as const;
          default:
            return {
              icon: <Sparkles className="h-4 w-4" />,
              accentLight: "bg-slate-500/10 text-slate-600",
              accentDark: "bg-slate-500/20 text-slate-300",
            } as const;
        }
      })();

      return {
        key: code || `lab-${index}`,
        title: labTitle,
        priceLabel,
        priceValue: query.data?.total_now ?? null,
        meta: coverageLabel,
        badge: undefined as string | undefined,
        active: selectedLabChoice === code,
        loading: query.isFetching || query.isLoading,
        disabled: optimizerInput.length === 0,
        onSelect: () => {
          autoSelectionRef.current = null;
          setSelectedLabChoice(code);
        },
        icon: preset.icon,
        accentLight: preset.accentLight,
        accentDark: preset.accentDark,
      };
    });

    const splitBonusCount = splitResult
      ? splitResult.items.reduce(
          (acc, item) =>
            acc + item.biomarkers.filter((token) => !optimizerInput.includes(token)).length,
          0,
        )
      : 0;
    const splitMissingCount = splitResult?.uncovered?.length ?? 0;
    const splitHasCounts = optimizerInput.length > 0 && (splitResult || splitBonusCount > 0 || splitMissingCount > 0);
    const splitMeta = !splitHasCounts
      ? optimizerInput.length === 0
        ? "Add biomarkers to compare labs"
        : "—"
      : `${splitMissingCount} Missing · ${splitBonusCount} Bonus`;

    cards.push({
      key: "all",
      title: "BOTH LABS",
      priceLabel: splitResult ? formatCurrency(splitResult.total_now) : "—",
      priceValue: splitResult?.total_now ?? null,
      meta: splitMeta,
      badge: undefined as string | undefined,
      active: selectedLabChoice === "all",
      loading: splitLoading,
      disabled: optimizerInput.length === 0,
      onSelect: () => {
        autoSelectionRef.current = null;
        setSelectedLabChoice("all");
      },
      icon: <Workflow className="h-4 w-4" />,
      accentLight: "bg-indigo-500/10 text-indigo-500",
      accentDark: "bg-indigo-500/20 text-indigo-200",
    });

    const priceCandidates = cards
      .map((card, index) => ({ index, price: card.priceValue ?? Number.POSITIVE_INFINITY }))
      .filter((entry) => Number.isFinite(entry.price));
    if (priceCandidates.length > 0) {
      const cheapest = priceCandidates.reduce((best, entry) =>
        entry.price < best.price ? entry : best,
      priceCandidates[0]);
      cards = cards.map((card, index) => ({
        ...card,
        badge: index === cheapest.index ? "Cheapest" : undefined,
      }));
    }

    return cards;
  }, [
    labComparisons,
    labOptions,
    optimizerInput,
    primaryLabCodes,
    selectedLabChoice,
    splitLoading,
    splitResult,
    labelForLab,
  ]);
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
    setListError(null);
    setListNotice(null);
  };

  const handleRemove = (code: string) => {
    setSelected((current) => current.filter((item) => item.code !== code));
  };

  const extractErrorMessage = useCallback((error: unknown) => {
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
  }, []);

  const handleTemplateSelect = useCallback(
    async (selection: { slug: string; name: string }) => {
      const { slug } = selection;
      try {
        const payload = await getJson(`/biomarker-lists/templates/${slug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);
        const existing = new Set(selected.map((item) => item.code));
        const additions = template.biomarkers.filter((entry) => !existing.has(entry.code));

        const notice: { tone: "success" | "info"; message: string } = additions.length === 0
          ? {
              tone: "info",
              message: `All biomarkers from ${template.name} are already selected.`,
            }
          : {
              tone: "success",
              message: `Added ${additions.length} biomarker${additions.length === 1 ? "" : "s"} from ${template.name}.`,
            };

        if (additions.length > 0) {
          const merged = [
            ...selected,
            ...additions.map((entry) => ({ code: entry.code, name: entry.display_name })),
          ];
          setSelected(merged);
          autoSelectionRef.current = null;
          setSelectedLabChoice(null);
        }

        setListError(null);
        setListNotice(notice);
      } catch (error) {
        setListNotice(null);
        setListError(extractErrorMessage(error));
      }
    },
    [extractErrorMessage, selected, setSelectedLabChoice],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const templateSlug = params.get("template");
    if (!templateSlug) {
      return;
    }

    let cancelled = false;

    const loadTemplate = async () => {
      try {
        const payload = await getJson(`/biomarker-lists/templates/${templateSlug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);
        if (cancelled) {
          return;
        }
        setSelected(
          template.biomarkers.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );
        autoSelectionRef.current = null;
        setSelectedLabChoice(null);
        setListError(null);
      } catch (error) {
        if (!cancelled) {
          setListError(extractErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          params.delete("template");
          const query = params.toString();
          router.replace(query ? `/?${query}` : "/", { scroll: false });
        }
      }
    };

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [router, extractErrorMessage, setSelectedLabChoice]);

  useEffect(() => {
    if (!listNotice) {
      return;
    }
    const timer = setTimeout(() => setListNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [listNotice]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get("shared");
    if (!sharedToken) {
      return;
    }

    let cancelled = false;

    const loadShared = async () => {
      try {
        const payload = await getJson(`/biomarker-lists/shared/${sharedToken}`);
        const sharedList = SavedListSchema.parse(payload);
        if (cancelled) {
          return;
        }
        setSelected(
          sharedList.biomarkers.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );
        autoSelectionRef.current = null;
        setSelectedLabChoice(null);
        setListError(null);
      } catch (error) {
        if (!cancelled) {
          setListError(extractErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          params.delete("shared");
          const query = params.toString();
          router.replace(query ? `/?${query}` : "/", { scroll: false });
        }
      }
    };

    void loadShared();

    return () => {
      cancelled = true;
    };
  }, [router, extractErrorMessage, setSelectedLabChoice]);

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

  const handleLoadList = useCallback(
    (list: SavedList) => {
      setSelected(list.biomarkers.map((entry) => ({ code: entry.code, name: entry.display_name })));
      autoSelectionRef.current = null;
      setSelectedLabChoice(null);
    },
    [setSelectedLabChoice],
  );

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

  const openTemplateModal = () => {
    const defaultName = selected.length
      ? `Template ${new Date().toLocaleDateString()}`
      : "";
    const initialSlug = defaultName ? slugify(defaultName) : "";
    setTemplateName(defaultName);
    setTemplateSlug(initialSlug);
    setTemplateDescription("");
    setTemplateIsActive(true);
    setTemplateError(null);
    setTemplateSlugTouched(Boolean(initialSlug));
    setIsTemplateModalOpen(true);
  };

  const handleTemplateNameChange = (value: string) => {
    setTemplateName(value);
    if (!templateSlugTouched) {
      setTemplateSlug(slugify(value));
    }
  };

  const handleTemplateSlugChange = (value: string) => {
    setTemplateSlug(value);
    setTemplateSlugTouched(true);
  };

  const handleTemplateConfirm = async () => {
    if (selected.length === 0) {
      const message = "Add biomarkers before saving a template.";
      setTemplateError(message);
      return;
    }

    const trimmedName = templateName.trim();
    const normalizedSlug = slugify(templateSlug || templateName);
    if (!trimmedName) {
      setTemplateError("Template name cannot be empty");
      return;
    }
    if (!normalizedSlug) {
      setTemplateError("Template slug cannot be empty");
      return;
    }

    setIsSavingTemplate(true);
    try {
      await templateAdmin.createMutation.mutateAsync({
        slug: normalizedSlug,
        name: trimmedName,
        description: templateDescription.trim() || null,
        is_active: templateIsActive,
        biomarkers: selected.map((entry) => ({
          code: entry.code,
          display_name: entry.name,
          notes: null,
        })),
      });
      setTemplateError(null);
      setIsTemplateModalOpen(false);
      setTemplateSlugTouched(false);
    } catch (error) {
      setTemplateError(extractErrorMessage(error));
    } finally {
      setIsSavingTemplate(false);
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
          href="/collections"
          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          Templates
        </Link>
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

      <TemplateModal
        open={isTemplateModalOpen}
        title="Publish curated template"
        submitLabel={isSavingTemplate ? "Saving…" : "Save template"}
        name={templateName}
        slug={templateSlug}
        description={templateDescription}
        isActive={templateIsActive}
        error={templateError}
        isSubmitting={isSavingTemplate}
        onNameChange={handleTemplateNameChange}
        onSlugChange={handleTemplateSlugChange}
        onDescriptionChange={setTemplateDescription}
        onIsActiveChange={setTemplateIsActive}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setTemplateError(null);
          setTemplateSlugTouched(false);
        }}
        onConfirm={handleTemplateConfirm}
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
                <SearchBox onSelect={handleSelect} onTemplateSelect={handleTemplateSelect} />
                <SelectedBiomarkers biomarkers={selected} onRemove={handleRemove} />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {listNotice && (
                  <p
                    className={`text-sm ${
                      listNotice.tone === "success" ? "text-emerald-300" : "text-slate-300"
                    }`}
                  >
                    {listNotice.message}
                  </p>
                )}
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
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={openTemplateModal}
                      className="rounded-full border border-sky-500/60 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
                    >
                      Save as template
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <OptimizationResults
            selected={optimizerInput}
            result={activeResult}
            isLoading={activeLoading}
            error={activeError ?? undefined}
            variant="dark"
            labCards={labCards}
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
