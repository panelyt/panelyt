"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Factory,
  FlaskConical,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  OptimizeResponseSchema,
  type LabAvailability,
  type OptimizeResponse,
  type AddonSuggestionsResponse,
} from "@panelyt/types";

import { useOptimization, useAddonSuggestions } from "./useOptimization";
import { postJson } from "../lib/http";
import { formatCurrency } from "../lib/format";

export interface LabCard {
  key: string;
  title: string;
  priceLabel: string;
  priceValue: number | null;
  meta: string;
  badge: string | undefined;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
  /** Structured data for compact display */
  savings?: {
    amount: number;
    label: string;
  };
  bonus?: {
    count: number;
    valueLabel?: string;
  };
  missing?: {
    count: number;
    tokens?: string[];
  };
  coversAll?: boolean;
}

export interface UseLabOptimizationResult {
  labCards: LabCard[];
  activeResult: OptimizeResponse | undefined;
  activeLoading: boolean;
  activeError: Error | null;
  labChoice: string | "all" | null;
  selectLab: (code: string | "all") => void;
  resetLabChoice: () => void;
  addonSuggestions: AddonSuggestionsResponse["addon_suggestions"];
  addonSuggestionsLoading: boolean;
}

export function useLabOptimization(
  biomarkerCodes: string[],
): UseLabOptimizationResult {
  const [selectedLabChoice, setSelectedLabChoice] = useState<string | "all" | null>(null);
  const [cachedLabOptions, setCachedLabOptions] = useState<LabAvailability[]>([]);
  const autoSelectionRef = useRef<string | null>(null);

  const optimizationKey = useMemo(
    () => biomarkerCodes.map((item) => item.toLowerCase()).sort().join("|"),
    [biomarkerCodes],
  );

  const autoOptimization = useOptimization(biomarkerCodes, "auto");
  const splitOptimization = useOptimization(biomarkerCodes, "split");

  const latestLabOptions = autoOptimization.data?.lab_options;
  const labOptions = latestLabOptions ?? cachedLabOptions;

  // Cache lab options and reset when selection clears
  useEffect(() => {
    if (latestLabOptions !== undefined) {
      setCachedLabOptions(latestLabOptions);
    }
    if (biomarkerCodes.length === 0) {
      setCachedLabOptions([]);
      setSelectedLabChoice(null);
      autoSelectionRef.current = null;
    }
  }, [latestLabOptions, biomarkerCodes.length]);

  const autoLabCode = autoOptimization.data?.lab_code ?? null;

  // Determine primary lab codes for comparison (max 2)
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

  // Run single_lab queries for each primary lab
  const labComparisons = useQueries({
    queries: primaryLabCodes.map((code) => ({
      queryKey: ["optimize", optimizationKey, "single_lab", code],
      queryFn: async () => {
        const payload = await postJson("/optimize", {
          biomarkers: biomarkerCodes,
          mode: "single_lab",
          lab_code: code,
        });
        return OptimizeResponseSchema.parse(payload);
      },
      enabled: biomarkerCodes.length > 0 && Boolean(code),
    })),
  });

  // Compute the default lab to select based on coverage and price
  const defaultSingleLabCode = useMemo(() => {
    if (biomarkerCodes.length === 0 || primaryLabCodes.length === 0) {
      return null;
    }

    let best: { code: string; covered: number; price: number } | null = null;

    for (let index = 0; index < primaryLabCodes.length; index += 1) {
      const code = primaryLabCodes[index];
      const option = labOptions.find((lab) => lab.code === code);
      const missingCount = option?.missing_tokens?.length ?? biomarkerCodes.length;
      const covered = Math.max(biomarkerCodes.length - missingCount, 0);
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
  }, [biomarkerCodes.length, labComparisons, labOptions, primaryLabCodes]);

  // Auto-select best lab, but preserve user overrides
  useEffect(() => {
    if (biomarkerCodes.length === 0 || primaryLabCodes.length === 0) {
      setSelectedLabChoice(null);
      autoSelectionRef.current = null;
      return;
    }

    const nextChoice = defaultSingleLabCode ?? primaryLabCodes[0] ?? null;

    if (!nextChoice) {
      return;
    }

    setSelectedLabChoice((current) => {
      // User explicitly chose "all" — don't override
      if (current === "all") {
        autoSelectionRef.current = null;
        return current;
      }

      const isCurrentValid = (current && primaryLabCodes.includes(current)) || false;

      // User made a manual selection that's still valid — preserve it
      if (isCurrentValid && autoSelectionRef.current === null) {
        return current;
      }

      // Current matches what auto would pick — keep it
      if (isCurrentValid && current === nextChoice) {
        autoSelectionRef.current = nextChoice;
        return current;
      }

      // Auto-select the best option
      autoSelectionRef.current = nextChoice;
      return nextChoice;
    });
  }, [defaultSingleLabCode, biomarkerCodes.length, primaryLabCodes]);

  // Derive loading/error states
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
    ? splitResult ?? (singleResult ? { ...singleResult, mode: "split" as const } : undefined)
    : singleResult;
  const activeLoading = selectedLabChoice === "all"
    ? splitLoading || (!splitResult && singleLoading)
    : singleLoading;
  const activeError = selectedLabChoice === "all"
    ? splitError ?? singleError
    : singleError;

  // Addon suggestions (lazy-loaded after optimization completes)
  const activeItemIds = useMemo(
    () => activeResult?.items?.map((item) => item.id) ?? [],
    [activeResult?.items],
  );
  const addonSuggestionsQuery = useAddonSuggestions(
    biomarkerCodes,
    activeItemIds,
    activeResult?.lab_code,
    !activeLoading,
  );

  // Helper: get display label for a lab code
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

  // User action: select a lab (clears auto-selection tracking)
  const selectLab = useCallback((code: string | "all") => {
    autoSelectionRef.current = null;
    setSelectedLabChoice(code);
  }, []);

  // Reset lab choice (for use when biomarker selection changes significantly)
  const resetLabChoice = useCallback(() => {
    autoSelectionRef.current = null;
    setSelectedLabChoice(null);
  }, []);

  // Build lab cards array
  const labCards = useMemo((): LabCard[] => {
    if (primaryLabCodes.length === 0) {
      return [];
    }

    let cards: LabCard[] = primaryLabCodes.map((code, index) => {
      const query = labComparisons[index];
      const option = labOptions.find((lab) => lab.code === code);
      const labShort = labelForLab(code, option?.name ?? query.data?.lab_name);
      const labTitle = `ONLY ${labShort}`;
      const priceLabel = query.data ? formatCurrency(query.data.total_now) : "—";
      const missingTokensCount = option?.missing_tokens?.length ?? 0;
      const hasGaps = option ? !option.covers_all && missingTokensCount > 0 : false;
      const uncoveredTotal = query.data ? query.data.uncovered.length : 0;
      const missingCount = hasGaps ? missingTokensCount : uncoveredTotal;
      const bonusTokens = query.data
        ? new Set(
            query.data.items.flatMap((item) =>
              item.biomarkers.filter((token) => !biomarkerCodes.includes(token)),
            ),
          )
        : new Set<string>();
      const bonusCount = bonusTokens.size;
      const bonusValue = query.data?.bonus_total_now ?? 0;
      const bonusValueLabel = bonusValue > 0 ? formatCurrency(bonusValue) : null;
      const hasCounts =
        biomarkerCodes.length > 0 &&
        (query.data || missingTokensCount > 0 || bonusCount > 0 || bonusValue > 0);
      const shouldShowBonusLabel = !!query.data || bonusCount > 0;
      const bonusLabel = shouldShowBonusLabel
        ? bonusCount > 0
          ? `${bonusCount} Bonus${bonusValueLabel ? ` (${bonusValueLabel})` : ""}`
          : "0 Bonus"
        : null;
      const coverageLabel = !hasCounts
        ? biomarkerCodes.length === 0
          ? "Add biomarkers to compare labs"
          : "—"
        : [`${missingCount} Missing`, bonusLabel].filter(Boolean).join(" · ");

      const preset = getLabPreset(labShort);

      // Compute savings
      const totalNow = query.data?.total_now ?? 0;
      const totalMin30 = query.data?.total_min30 ?? 0;
      const savingsAmount = Math.max(totalNow - totalMin30, 0);
      const savingsLabel = savingsAmount > 0 ? formatCurrency(savingsAmount) : "";

      // Determine if lab covers all
      const coversAll = option?.covers_all ?? (missingCount === 0);

      return {
        key: code || `lab-${index}`,
        title: labTitle,
        priceLabel,
        priceValue: query.data?.total_now ?? null,
        meta: coverageLabel,
        badge: undefined,
        active: selectedLabChoice === code,
        loading: query.isFetching || query.isLoading,
        disabled: biomarkerCodes.length === 0,
        onSelect: () => selectLab(code),
        icon: preset.icon,
        accentLight: preset.accentLight,
        accentDark: preset.accentDark,
        savings: savingsAmount > 0 ? { amount: savingsAmount, label: savingsLabel } : undefined,
        bonus: bonusCount > 0 ? { count: bonusCount, valueLabel: bonusValueLabel ?? undefined } : undefined,
        missing: missingCount > 0 ? { count: missingCount, tokens: option?.missing_tokens } : undefined,
        coversAll,
      };
    });

    // Add "Both Labs" card
    const splitBonusCount = splitResult
      ? new Set(
          splitResult.items.flatMap((item) =>
            item.biomarkers.filter((token) => !biomarkerCodes.includes(token)),
          ),
        ).size
      : 0;
    const splitMissingCount = splitResult?.uncovered?.length ?? 0;
    const splitBonusValue = splitResult?.bonus_total_now ?? 0;
    const splitBonusLabel =
      splitResult || splitBonusCount > 0
        ? splitBonusCount > 0
          ? `${splitBonusCount} Bonus${
              splitBonusValue > 0 ? ` (${formatCurrency(splitBonusValue)})` : ""
            }`
          : "0 Bonus"
        : null;
    const splitHasCounts =
      biomarkerCodes.length > 0 &&
      (splitResult || splitBonusCount > 0 || splitMissingCount > 0 || !!splitBonusLabel);
    const splitMeta = !splitHasCounts
      ? biomarkerCodes.length === 0
        ? "Add biomarkers to compare labs"
        : "—"
      : [
          `${splitMissingCount} Missing`,
          splitBonusLabel,
        ]
          .filter(Boolean)
          .join(" · ");

    // Compute savings for split
    const splitTotalNow = splitResult?.total_now ?? 0;
    const splitTotalMin30 = splitResult?.total_min30 ?? 0;
    const splitSavingsAmount = Math.max(splitTotalNow - splitTotalMin30, 0);
    const splitSavingsLabel = splitSavingsAmount > 0 ? formatCurrency(splitSavingsAmount) : "";

    cards.push({
      key: "all",
      title: "BOTH LABS",
      priceLabel: splitResult ? formatCurrency(splitResult.total_now) : "—",
      priceValue: splitResult?.total_now ?? null,
      meta: splitMeta,
      badge: undefined,
      active: selectedLabChoice === "all",
      loading: splitLoading,
      disabled: biomarkerCodes.length === 0,
      onSelect: () => selectLab("all"),
      icon: <Workflow className="h-4 w-4" />,
      accentLight: "bg-indigo-500/10 text-indigo-500",
      accentDark: "bg-indigo-500/20 text-indigo-200",
      savings: splitSavingsAmount > 0 ? { amount: splitSavingsAmount, label: splitSavingsLabel } : undefined,
      bonus: splitBonusCount > 0 ? { count: splitBonusCount, valueLabel: splitBonusValue > 0 ? formatCurrency(splitBonusValue) : undefined } : undefined,
      missing: splitMissingCount > 0 ? { count: splitMissingCount } : undefined,
      coversAll: splitMissingCount === 0,
    });

    // Mark cheapest card with badge
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
    biomarkerCodes,
    labComparisons,
    labOptions,
    labelForLab,
    primaryLabCodes,
    selectLab,
    selectedLabChoice,
    splitLoading,
    splitResult,
  ]);

  return {
    labCards,
    activeResult,
    activeLoading,
    activeError,
    labChoice: selectedLabChoice,
    selectLab,
    resetLabChoice,
    addonSuggestions: addonSuggestionsQuery.data?.addon_suggestions ?? [],
    addonSuggestionsLoading: addonSuggestionsQuery.isLoading,
  };
}

// Helper: get icon and colors for a lab
function getLabPreset(labShort: string): {
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
} {
  switch (labShort) {
    case "DIAG":
      return {
        icon: <FlaskConical className="h-4 w-4" />,
        accentLight: "bg-emerald-500/10 text-emerald-600",
        accentDark: "bg-emerald-500/20 text-emerald-200",
      };
    case "ALAB":
      return {
        icon: <Factory className="h-4 w-4" />,
        accentLight: "bg-sky-500/10 text-sky-500",
        accentDark: "bg-sky-500/20 text-sky-200",
      };
    default:
      return {
        icon: <Sparkles className="h-4 w-4" />,
        accentLight: "bg-slate-500/10 text-slate-600",
        accentDark: "bg-slate-500/20 text-slate-300",
      };
  }
}
