"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { SegmentedControl } from "@/ui/segmented-control";
import { Switch } from "@/ui/switch";

const sortOptions = [
  { value: "updated", labelKey: "collections.sortUpdated" },
  { value: "count", labelKey: "collections.sortCount" },
  { value: "total", labelKey: "collections.sortTotal" },
] as const;

type SortOption = (typeof sortOptions)[number]["value"];

interface CollectionsToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortValue: SortOption;
  onSortChange: (value: SortOption) => void;
  showInactive: boolean;
  onShowInactiveChange: (checked: boolean) => void;
  isAdmin: boolean;
  resultCount: number;
  onClearFilters: () => void;
  className?: string;
}

function CollectionsToolbar({
  searchValue,
  onSearchChange,
  sortValue,
  onSortChange,
  showInactive,
  onShowInactiveChange,
  isAdmin,
  resultCount,
  onClearFilters,
  className,
}: CollectionsToolbarProps) {
  const t = useTranslations();
  const hasSearch = searchValue.trim().length > 0;
  const showClearFilters = hasSearch || (isAdmin && showInactive);
  const segmentedOptions = sortOptions.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));

  return (
    <div className={cn("sticky top-24 z-40", className)}>
      <div className="flex flex-col gap-4 rounded-panel border border-border/70 bg-surface-1/90 p-3 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-2 md:max-w-sm">
          <label
            htmlFor="template-search"
            className="text-xs font-semibold uppercase tracking-wide text-secondary"
          >
            {t("collections.searchLabel")}
          </label>
          <Input
            id="template-search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("collections.searchPlaceholder")}
            aria-label={t("collections.searchLabel")}
            leading={<Search className="h-4 w-4" aria-hidden="true" />}
            clearable
            clearLabel={t("collections.clearSearch")}
          />
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-3 md:justify-end">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
              {t("collections.sortLabel")}
            </span>
            <SegmentedControl
              value={sortValue}
              options={segmentedOptions}
              onValueChange={(value) => onSortChange(value as SortOption)}
              ariaLabel={t("collections.sortLabel")}
            />
          </div>
          {isAdmin ? (
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary">
              <Switch
                checked={showInactive}
                onCheckedChange={onShowInactiveChange}
                aria-label={t("collections.showInactive")}
              />
              {t("collections.showInactive")}
            </label>
          ) : null}
          <span className="text-xs text-secondary">
            {t("collections.resultsCount", { count: resultCount })}
          </span>
          {showClearFilters ? (
            <Button variant="secondary" size="md" onClick={onClearFilters}>
              {t("collections.clearFilters")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { CollectionsToolbar, sortOptions };
export type { CollectionsToolbarProps, SortOption };
