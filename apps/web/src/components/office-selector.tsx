"use client";

import { useEffect, useMemo, useRef, useState, useId } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDebounce } from "../hooks/useDebounce";
import { useInstitution } from "../hooks/useInstitution";
import { useInstitutionSearch } from "../hooks/useInstitutionSearch";
import { cn } from "../lib/cn";

interface OfficeSelectorProps {
  className?: string;
}

const formatInstitutionLabel = (institution: {
  name: string;
  city?: string | null;
}) => {
  const parts = [institution.name];
  if (institution.city) {
    parts.push(institution.city);
  }
  return parts.join(" · ");
};

export function OfficeSelector({ className }: OfficeSelectorProps) {
  const t = useTranslations();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { institutionId, label, setInstitution } = useInstitution();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debounced = useDebounce(query, 200);
  const searchQuery = useInstitutionSearch(debounced);
  const results = useMemo(
    () => searchQuery.data?.results ?? [],
    [searchQuery.data?.results],
  );

  const currentLabel = label ?? `#${institutionId}`;
  const showResults = isOpen && query.trim().length >= 2;
  const activeOptionId =
    highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined;

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }
    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleSelect = (institution: {
    id: number;
    name: string;
    city?: string | null;
    address?: string | null;
  }) => {
    const nextLabel = formatInstitutionLabel(institution);
    setInstitution({ id: institution.id, label: nextLabel });
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface-2/70 px-3 py-2 text-xs font-medium text-secondary transition hover:border-border hover:text-primary"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="max-w-[12rem] truncate">
          {t("officeSelector.triggerLabel", { name: currentLabel })}
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/70 bg-surface-1/95 p-3 shadow-xl backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (results.length === 0) return;
                  setHighlightedIndex((prev) =>
                    Math.min(prev + 1, results.length - 1),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (results.length === 0) return;
                  setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                    handleSelect(results[highlightedIndex]);
                    return;
                  }
                  if (results.length > 0) {
                    handleSelect(results[0]);
                  }
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsOpen(false);
                }
              }}
              placeholder={t("officeSelector.searchPlaceholder")}
              className="w-full rounded-lg border border-border/60 bg-transparent py-2 pl-9 pr-3 text-sm text-primary outline-none transition focus:border-emerald-400"
              role="combobox"
              aria-controls={listId}
              aria-expanded={showResults}
              aria-activedescendant={activeOptionId}
            />
          </div>

          <div className="mt-2 text-[11px] text-secondary">
            {t("officeSelector.currentLabel", { name: currentLabel })}
          </div>

          {showResults && (
            <div
              id={listId}
              role="listbox"
              className="mt-3 max-h-64 overflow-auto rounded-lg border border-border/60 bg-surface-2/70"
            >
              {searchQuery.isFetching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("officeSelector.loading")}
                </div>
              )}
              {!searchQuery.isFetching && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-secondary">
                  {t("officeSelector.noResults")}
                </div>
              )}
              {!searchQuery.isFetching &&
                results.map((institution, index) => {
                  const isActive = index === highlightedIndex;
                  const optionLabel = formatInstitutionLabel(institution);
                  return (
                    <button
                      key={institution.id}
                      id={`${listId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-label={optionLabel}
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(institution)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm transition",
                        isActive
                          ? "bg-emerald-500/20 text-primary"
                          : "text-secondary hover:bg-surface-2/80 hover:text-primary",
                      )}
                    >
                      <div className="truncate font-medium text-primary">
                        {institution.name}
                      </div>
                      {(institution.city || institution.address) && (
                        <div className="truncate text-[11px] text-secondary">
                          {[institution.city, institution.address]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
