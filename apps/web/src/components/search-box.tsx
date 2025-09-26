"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { type CatalogSearchResult } from "@panelyt/types";

import { useDebounce } from "../hooks/useDebounce";
import { useCatalogSearch } from "../hooks/useCatalogSearch";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface TemplateSelection {
  slug: string;
  name: string;
}

interface Props {
  onSelect: (biomarker: SelectedBiomarker) => void;
  onTemplateSelect: (template: TemplateSelection) => void;
}

export function SearchBox({ onSelect, onTemplateSelect }: Props) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounced = useDebounce(query, 200);
  const { data, isFetching } = useCatalogSearch(debounced);
  const suggestions = useMemo<CatalogSearchResult[]>(
    () => data?.results ?? [],
    [data?.results],
  );
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    if (!pendingQuery) {
      return;
    }
    const normalized = query.trim().toLowerCase();
    if (normalized !== pendingQuery) {
      setPendingQuery(null);
    }
  }, [query, pendingQuery]);

  const commitSuggestion = useCallback(
    (suggestion: CatalogSearchResult) => {
      if (suggestion.type === "template") {
        onTemplateSelect({ slug: suggestion.slug, name: suggestion.name });
      } else {
        let code = suggestion.elab_code ?? suggestion.slug ?? suggestion.name;
        if (!code) {
          code = suggestion.name;
        }
        const shouldNormalize = Boolean(suggestion.elab_code) && !/[^a-z0-9-]/i.test(code);
        const normalized = shouldNormalize ? code.toUpperCase() : code;
        onSelect({ code: normalized, name: suggestion.name });
      }
      setQuery("");
      setHighlightedIndex(-1);
      setPendingQuery(null);
    },
    [onSelect, onTemplateSelect],
  );

  const handleSubmit = () => {
    if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
      const selectedResult = suggestions[highlightedIndex];
      commitSuggestion(selectedResult);
      return;
    }

    if (suggestions.length > 0) {
      commitSuggestion(suggestions[0]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const trimmedLower = trimmed.toLowerCase();
    const debouncedLower = debounced.trim().toLowerCase();

    if (trimmed.length >= 2 && (isFetching || debouncedLower !== trimmedLower)) {
      setPendingQuery(trimmedLower);
      return;
    }

    const shouldNormalize = !/[^a-z0-9-]/i.test(trimmed);
    const normalized = shouldNormalize ? trimmed.toUpperCase() : trimmed;
    onSelect({ code: normalized, name: trimmed });
    setQuery("");
    setHighlightedIndex(-1);
    setPendingQuery(null);
  };

  useEffect(() => {
    if (!pendingQuery) {
      return;
    }

    const normalizedDebounced = debounced.trim().toLowerCase();

    if (normalizedDebounced !== pendingQuery) {
      return;
    }

    if (suggestions.length === 0) {
      if (!isFetching) {
        setPendingQuery(null);
      }
      return;
    }

    commitSuggestion(suggestions[0]);
  }, [pendingQuery, suggestions, debounced, isFetching, commitSuggestion]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((prev) =>
                  prev < suggestions.length - 1 ? prev + 1 : prev
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((prev) =>
                  prev > 0 ? prev - 1 : -1
                );
              } else if (event.key === "Escape") {
                event.preventDefault();
                setHighlightedIndex(-1);
                setQuery("");
              }
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            placeholder="Search biomarkers"
          />
        </div>
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={(isFetching && suggestions.length === 0) || pendingQuery !== null}
        >
          Add to panel
        </button>
      </div>
      {query.length >= 2 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/95 shadow-2xl shadow-slate-950/40 backdrop-blur">
          {suggestions.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {suggestions.map((item, index) => {
                const isHighlighted = index === highlightedIndex;
                const isTemplate = item.type === "template";
                const templateDescription = isTemplate
                  ? item.description?.trim() ?? ""
                  : "";
                const biomarkerBadge = !isTemplate
                  ? (item.elab_code ?? item.slug ?? item.name) ?? ""
                  : null;
                const rightLabel = isTemplate
                  ? templateDescription || null
                  : biomarkerBadge
                    ? item.elab_code
                      ? biomarkerBadge.toUpperCase()
                      : biomarkerBadge
                    : null;
                const rightLabelClass = [
                  "text-xs",
                  isTemplate ? "truncate text-right" : "uppercase tracking-wide",
                  isHighlighted
                    ? "text-white/90"
                    : isTemplate
                      ? "text-slate-300"
                      : "text-emerald-300",
                ].join(" ");
                return (
                  <li key={`${item.type}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => commitSuggestion(item)}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                        isHighlighted
                          ? "bg-emerald-400/20 text-white"
                          : "hover:bg-slate-800/70 text-slate-200"
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <span className={`font-medium ${
                          isHighlighted ? "text-white" : "text-slate-100"
                        }`}>
                          {item.name}
                        </span>
                        {isTemplate && (
                          <span className={`text-[11px] uppercase tracking-wide ${
                            isHighlighted ? "text-white/80" : "text-amber-300"
                          }`}>
                            Template · {item.biomarker_count} biomarker
                            {item.biomarker_count === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {rightLabel && (
                        <span
                          className={rightLabelClass}
                        >
                          {rightLabel}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-300">
              <SparklesNote />
              <span>No direct matches yet. Try typing the biomarker name.</span>
            </div>
          )}
        </div>
      )}
      {isFetching && (
        <div className="absolute right-4 top-2.5 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Searching…</span>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Tip: press <span className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px]">Enter</span>
        to add the top match instantly.
      </p>
    </div>
  );
}

function SparklesNote() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
      <SearchIcon className="h-3.5 w-3.5" />
    </span>
  );
}
