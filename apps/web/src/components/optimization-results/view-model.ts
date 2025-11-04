import type { OptimizeResponse } from "@panelyt/types";

import { formatCurrency } from "../../lib/format";

export interface OptimizationGroup {
  kind: "package" | "single";
  items: OptimizeResponse["items"];
}

export interface AddonSuggestionViewModel {
  key: string;
  package: OptimizeResponse["addon_suggestions"][number]["package"];
  upgradeCostLabel: string;
  upgradeCostValue: number;
  upgradeCostGrosz: number;
  estimatedTotalLabel: string;
  estimatedTotalValue: number;
  adds: OptimizeResponse["addon_suggestions"][number]["adds"];
  covers: OptimizeResponse["addon_suggestions"][number]["covers"];
}

export interface OptimizationViewModel {
  variant: "light" | "dark";
  isDark: boolean;
  selected: string[];
  selectedSet: Set<string>;
  result: OptimizeResponse;
  groups: OptimizationGroup[];
  totalNowGrosz: number;
  totalMin30Grosz: number;
  displayNameFor: (code: string) => string;
  bonusBiomarkers: string[];
  bonusPricing: {
    totalNowLabel: string;
    totalNowValue: number;
  };
  coverage: {
    percent: number;
    coveredTokens: string[];
    uncoveredTokens: string[];
  };
  pricing: {
    totalMin30Label: string;
    potentialSavingsLabel: string;
    potentialSavingsRaw: number;
    highlightSavings: boolean;
  };
  counts: {
    items: number;
    packages: number;
    singles: number;
    onSale: number;
  };
  exclusive: {
    labTitle: string;
    biomarkers: Array<{ code: string; displayName: string }>;
  };
  overlaps: Array<{
    code: string;
    displayName: string;
    packages: string[];
  }>;
  addons: AddonSuggestionViewModel[];
}

interface BuildOptimizationViewModelArgs {
  selected: string[];
  result: OptimizeResponse;
  variant: "light" | "dark";
  biomarkerNames?: Record<string, string>;
}

export function buildOptimizationViewModel({
  selected,
  result,
  variant,
  biomarkerNames = {},
}: BuildOptimizationViewModelArgs): OptimizationViewModel {
  const isDark = variant === "dark";
  const selectedSet = new Set(selected);
  const labelMap = result.labels ?? {};
  const allBiomarkers = result.items.flatMap((item) => item.biomarkers);
  const uniqueBiomarkers = Array.from(new Set(allBiomarkers));
  const bonusBiomarkers = uniqueBiomarkers.filter((code) => !selectedSet.has(code));
  const displayNameFor = createDisplayResolver(labelMap, biomarkerNames);

  const uncoveredTokens = result.uncovered ?? [];
  const coveredTokens = selected.filter((token) => !uncoveredTokens.includes(token));
  const coveragePercent = selected.length
    ? Math.round((coveredTokens.length / selected.length) * 100)
    : 0;

  const potentialSavingsRaw = Math.max(result.total_now - result.total_min30, 0);
  const highlightSavings = potentialSavingsRaw > 0.01;
  const potentialSavingsLabel = potentialSavingsRaw > 0 ? formatCurrency(potentialSavingsRaw) : "—";
  const totalMin30Label = formatCurrency(result.total_min30);
  const bonusTotalNowValue = Math.max(result.bonus_total_now ?? 0, 0);
  const bonusTotalNowLabel = formatCurrency(bonusTotalNowValue);

  const groups = groupByKind(result.items);
  const packagesCount = groups.find((group) => group.kind === "package")?.items.length ?? 0;
  const singlesCount = groups.find((group) => group.kind === "single")?.items.length ?? 0;
  const onSaleCount = result.items.filter((item) => item.on_sale).length;
  const totalNowGrosz = result.items.reduce((sum, item) => sum + item.price_now_grosz, 0);
  const totalMin30Grosz = result.items.reduce((sum, item) => sum + item.price_min30_grosz, 0);

  const exclusiveEntries = Object.entries(result.exclusive ?? {});
  const exclusiveBiomarkers = exclusiveEntries.map(([code]) => ({
    code,
    displayName: displayNameFor(code),
  }));
  const labTitle = result.lab_name || result.lab_code.toUpperCase();

  const overlaps = Array.from(
    result.items.reduce((acc, item) => {
      if (item.kind !== "package") {
        return acc;
      }
      for (const biomarker of item.biomarkers) {
        const current = acc.get(biomarker) ?? new Set<string>();
        current.add(item.name);
        acc.set(biomarker, current);
      }
      return acc;
    }, new Map<string, Set<string>>()),
  )
    .filter(([, items]) => items.size > 1)
    .map(([code, items]) => ({
      code,
      displayName: displayNameFor(code),
      packages: Array.from(items),
    }))
    .sort((a, b) => b.packages.length - a.packages.length || a.code.localeCompare(b.code));

  const addons: AddonSuggestionViewModel[] = (result.addon_suggestions ?? []).map((addon) => {
    const upgradeCostValue =
      addon.upgrade_cost ?? addon.upgrade_cost_grosz / 100;
    const estimatedTotalValue =
      addon.estimated_total_now ?? addon.estimated_total_now_grosz / 100;
    return {
      key: `addon-${addon.package.id}`,
      package: addon.package,
      upgradeCostLabel: formatCurrency(upgradeCostValue),
      upgradeCostValue,
      upgradeCostGrosz: addon.upgrade_cost_grosz,
      estimatedTotalLabel: formatCurrency(estimatedTotalValue),
      estimatedTotalValue,
      adds: addon.adds ?? [],
      covers: addon.covers ?? [],
    };
  });

  return {
    variant,
    isDark,
    selected,
    selectedSet,
    result,
    groups,
    totalNowGrosz,
    totalMin30Grosz,
    displayNameFor,
    bonusBiomarkers,
    bonusPricing: {
      totalNowLabel: bonusTotalNowLabel,
      totalNowValue: bonusTotalNowValue,
    },
    coverage: {
      percent: coveragePercent,
      coveredTokens,
      uncoveredTokens,
    },
    pricing: {
      totalMin30Label,
      potentialSavingsLabel,
      potentialSavingsRaw,
      highlightSavings,
    },
    counts: {
      items: result.items.length,
      packages: packagesCount,
      singles: singlesCount,
      onSale: onSaleCount,
    },
    exclusive: {
      labTitle,
      biomarkers: exclusiveBiomarkers,
    },
    overlaps,
    addons,
  };
}

function createDisplayResolver(
  labelMap: Record<string, string>,
  biomarkerNames: Record<string, string>,
) {
  return (code: string) => {
    const normalized = code.trim().toUpperCase();
    return (
      labelMap[code] ??
      labelMap[normalized] ??
      biomarkerNames[code] ??
      biomarkerNames[normalized] ??
      code
    );
  };
}

function groupByKind(items: OptimizeResponse["items"]): OptimizationGroup[] {
  const packages: OptimizeResponse["items"] = [];
  const singles: OptimizeResponse["items"] = [];
  for (const item of items) {
    if (item.kind === "package") {
      packages.push(item);
    } else {
      singles.push(item);
    }
  }
  const sortByPrice = (a: OptimizeResponse["items"][number], b: OptimizeResponse["items"][number]) =>
    b.price_now_grosz - a.price_now_grosz;
  packages.sort(sortByPrice);
  singles.sort(sortByPrice);
  return [
    { kind: "package", items: packages },
    { kind: "single", items: singles },
  ];
}
