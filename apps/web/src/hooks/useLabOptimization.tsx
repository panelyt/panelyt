"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Factory,
  FlaskConical,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  OptimizeCompareResponseSchema,
  type LabAvailability,
  type OptimizeCompareResponse,
  type OptimizeResponse,
  type AddonSuggestionsResponse,
} from "@panelyt/types";
import { useTranslations } from "next-intl";

import { useAddonSuggestions } from "./useOptimization";
import { useDebounce } from "./useDebounce";
import { postParsedJson } from "../lib/http";
import { formatCurrency } from "../lib/format";

export interface LabCard {
  key: string;
  title: string;
  shortLabel?: string;
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

/** Debounce delay for optimization requests (ms) */
const OPTIMIZATION_DEBOUNCE_MS = 400;

export function useLabOptimization(
  biomarkerCodes: string[],
): UseLabOptimizationResult {
  const t = useTranslations();
  const [selectedLabChoice, setSelectedLabChoice] = useState<string | "all" | null>(null);
  const [cachedLabOptions, setCachedLabOptions] = useState<LabAvailability[]>([]);
  const autoSelectionRef = useRef<string | null>(null);

  // Debounce biomarker changes to prevent excessive server requests during rapid selection.
  // We intentionally use:
  // - biomarkerCodes (immediate) for UI states like "disabled" to provide instant feedback
  // - debouncedBiomarkerCodes for API calls and cache management to stay synchronized
  const debouncedBiomarkerCodes = useDebounce(biomarkerCodes, OPTIMIZATION_DEBOUNCE_MS);

  const optimizationKey = useMemo(
    () => debouncedBiomarkerCodes.map((item) => item.toLowerCase()).sort().join("|"),
    [debouncedBiomarkerCodes],
  );

  const compareQuery = useQuery<OptimizeCompareResponse, Error>({
    queryKey: ["optimize-compare", optimizationKey],
    queryFn: async ({ signal }) =>
      postParsedJson(
        "/optimize/compare",
        OptimizeCompareResponseSchema,
        { biomarkers: debouncedBiomarkerCodes },
        { signal },
      ),
    enabled: debouncedBiomarkerCodes.length > 0,
  });

  const compareLoading = compareQuery.isLoading || compareQuery.isFetching;
  const compareError =
    compareQuery.error instanceof Error ? compareQuery.error : null;
  const autoResult = compareQuery.data?.auto;
  const splitResult = compareQuery.data?.split;
  const byLab = useMemo(
    () => compareQuery.data?.by_lab ?? {},
    [compareQuery.data?.by_lab],
  );

  const latestLabOptions = compareQuery.data?.lab_options;
  const labOptions = latestLabOptions ?? cachedLabOptions;

  // Cache lab options and reset when selection clears.
  // Uses debouncedBiomarkerCodes.length to stay synchronized with query data and avoid
  // race conditions where stale query results could overwrite a cleared cache.
  useEffect(() => {
    if (latestLabOptions !== undefined) {
      setCachedLabOptions(latestLabOptions);
    }
    if (debouncedBiomarkerCodes.length === 0) {
      setCachedLabOptions([]);
      setSelectedLabChoice(null);
      autoSelectionRef.current = null;
    }
  }, [latestLabOptions, debouncedBiomarkerCodes.length]);

  const autoLabCode = autoResult?.lab_code ?? null;

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

  // Compute the default lab to select based on coverage and price
  const defaultSingleLabCode = useMemo(() => {
    if (debouncedBiomarkerCodes.length === 0 || primaryLabCodes.length === 0) {
      return null;
    }

    let best: { code: string; covered: number; price: number } | null = null;

    for (const code of primaryLabCodes) {
      const option = labOptions.find((lab) => lab.code === code);
      const missingCount = option?.missing_tokens?.length ?? debouncedBiomarkerCodes.length;
      const covered = Math.max(debouncedBiomarkerCodes.length - missingCount, 0);
      const price = byLab[code]?.total_now ?? Number.POSITIVE_INFINITY;
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
  }, [byLab, debouncedBiomarkerCodes.length, labOptions, primaryLabCodes]);

  // Auto-select best lab, but preserve user overrides
  useEffect(() => {
    if (debouncedBiomarkerCodes.length === 0 || primaryLabCodes.length === 0) {
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
  }, [defaultSingleLabCode, debouncedBiomarkerCodes.length, primaryLabCodes]);

  // Derive loading/error states
  const resolvedSingleCode =
    selectedLabChoice && selectedLabChoice !== "all"
      ? selectedLabChoice
      : primaryLabCodes[0] ?? autoLabCode;

  const singleResult = resolvedSingleCode
    ? byLab[resolvedSingleCode] ?? autoResult
    : autoResult;

  const activeResult = selectedLabChoice === "all"
    ? splitResult ?? (singleResult ? { ...singleResult, mode: "split" as const } : undefined)
    : singleResult;
  const activeLoading = compareLoading;
  const activeError = compareError;

  // Addon suggestions (lazy-loaded after optimization completes)
  const activeItemIds = useMemo(
    () => activeResult?.items?.map((item) => item.id) ?? [],
    [activeResult?.items],
  );
  const addonSuggestionsQuery = useAddonSuggestions(
    debouncedBiomarkerCodes,
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
    const fallback = (code || name || t("optimization.labFallback")).trim();
    return fallback ? fallback.toUpperCase() : "LAB";
  }, [t]);

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
      const labResult = byLab[code];
      const option = labOptions.find((lab) => lab.code === code);
      const labShort = labelForLab(code, option?.name ?? labResult?.lab_name);
      const labTitle = t("optimization.labOnly", { lab: labShort });
      const priceLabel = labResult ? formatCurrency(labResult.total_now) : "—";
      const missingTokensCount = option?.missing_tokens?.length ?? 0;
      const hasGaps = option ? !option.covers_all && missingTokensCount > 0 : false;
      const uncoveredTotal = labResult ? labResult.uncovered.length : 0;
      const missingCount = hasGaps ? missingTokensCount : uncoveredTotal;
      const bonusTokens = labResult
        ? new Set(
            labResult.items.flatMap((item) =>
              item.biomarkers.filter((token) => !debouncedBiomarkerCodes.includes(token)),
            ),
          )
        : new Set<string>();
      const bonusCount = bonusTokens.size;
      const bonusValue = labResult?.bonus_total_now ?? 0;
      const bonusValueLabel = bonusValue > 0 ? formatCurrency(bonusValue) : null;
      const hasCounts =
        debouncedBiomarkerCodes.length > 0 &&
        (labResult || missingTokensCount > 0 || bonusCount > 0 || bonusValue > 0);
      const shouldShowBonusLabel = !!labResult || bonusCount > 0;
      const bonusLabel = shouldShowBonusLabel
        ? bonusValueLabel
          ? t("optimization.bonusShortWithValue", {
              count: bonusCount,
              value: bonusValueLabel,
            })
          : t("optimization.bonusShort", { count: bonusCount })
        : null;
      const coverageLabel = !hasCounts
        ? debouncedBiomarkerCodes.length === 0
          ? t("optimization.addBiomarkersToCompare")
          : "—"
        : [
            t("optimization.missingShort", { count: missingCount }),
            bonusLabel,
          ]
            .filter(Boolean)
            .join(" · ");

      const preset = getLabPreset(labShort);

      // Compute savings
      const totalNow = labResult?.total_now ?? 0;
      const totalMin30 = labResult?.total_min30 ?? 0;
      const savingsAmount = Math.max(totalNow - totalMin30, 0);
      const savingsLabel = savingsAmount > 0 ? formatCurrency(savingsAmount) : "";

      // Determine if lab covers all
      const coversAll = option?.covers_all ?? (missingCount === 0);

      return {
        key: code || `lab-${index}`,
        title: labTitle,
        shortLabel: labShort,
        priceLabel,
        priceValue: labResult?.total_now ?? null,
        meta: coverageLabel,
        badge: undefined,
        active: selectedLabChoice === code,
        loading: compareLoading,
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
            item.biomarkers.filter((token) => !debouncedBiomarkerCodes.includes(token)),
          ),
        ).size
      : 0;
    const splitMissingCount = splitResult?.uncovered?.length ?? 0;
    const splitBonusValue = splitResult?.bonus_total_now ?? 0;
    const splitBonusValueLabel =
      splitBonusValue > 0 ? formatCurrency(splitBonusValue) : null;
    const splitBonusLabel =
      splitResult || splitBonusCount > 0
        ? splitBonusValueLabel
          ? t("optimization.bonusShortWithValue", {
              count: splitBonusCount,
              value: splitBonusValueLabel,
            })
          : t("optimization.bonusShort", { count: splitBonusCount })
        : null;
    const splitHasCounts =
      debouncedBiomarkerCodes.length > 0 &&
      (splitResult || splitBonusCount > 0 || splitMissingCount > 0 || !!splitBonusLabel);
    const splitMeta = !splitHasCounts
      ? debouncedBiomarkerCodes.length === 0
        ? t("optimization.addBiomarkersToCompare")
        : "—"
      : [
          t("optimization.missingShort", { count: splitMissingCount }),
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
      title: t("optimization.bothLabs"),
      shortLabel: t("optimization.bothLabs"),
      priceLabel: splitResult ? formatCurrency(splitResult.total_now) : "—",
      priceValue: splitResult?.total_now ?? null,
      meta: splitMeta,
      badge: undefined,
      active: selectedLabChoice === "all",
      loading: compareLoading,
      disabled: biomarkerCodes.length === 0,
      onSelect: () => selectLab("all"),
      icon: <Workflow className="h-4 w-4" />,
      accentLight: "bg-indigo-500/10 text-indigo-500",
      accentDark: "bg-indigo-500/20 text-indigo-200",
      savings: splitSavingsAmount > 0 ? { amount: splitSavingsAmount, label: splitSavingsLabel } : undefined,
      bonus: splitBonusCount > 0 ? { count: splitBonusCount, valueLabel: splitBonusValueLabel ?? undefined } : undefined,
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
        badge: index === cheapest.index ? t("optimization.cheapestBadge") : undefined,
      }));
    }

    return cards;
  }, [
    biomarkerCodes.length,
    compareLoading,
    byLab,
    debouncedBiomarkerCodes,
    labOptions,
    labelForLab,
    primaryLabCodes,
    selectLab,
    selectedLabChoice,
    splitResult,
    t,
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
