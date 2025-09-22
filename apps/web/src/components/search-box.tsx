"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";

import { useDebounce } from "../hooks/useDebounce";
import { useBiomarkerSearch } from "../hooks/useBiomarkerSearch";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface Props {
  onSelect: (biomarker: SelectedBiomarker) => void;
}

export function SearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounced = useDebounce(query, 200);
  const { data, isFetching } = useBiomarkerSearch(debounced);
  const suggestions = useMemo(() => data?.results ?? [], [data?.results]);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  const handleSubmit = (value?: string, name?: string) => {
    // If value and name are provided, use them directly (clicked suggestion)
    if (value && name) {
      const normalized = /[^a-z0-9-]/i.test(value) ? value : value.toUpperCase();
      onSelect({ code: normalized, name });
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }

    // If a suggestion is highlighted, use it
    if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
      const selectedResult = suggestions[highlightedIndex];
      const selection = selectedResult.elab_code
        ? selectedResult.elab_code.toUpperCase()
        : (selectedResult.slug ?? selectedResult.name);
      onSelect({ code: selection, name: selectedResult.name });
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }

    // If no specific value provided and no highlight, try to use first search result
    if (suggestions.length > 0) {
      const firstResult = suggestions[0];
      const selection = firstResult.elab_code
        ? firstResult.elab_code.toUpperCase()
        : (firstResult.slug ?? firstResult.name);
      onSelect({ code: selection, name: firstResult.name });
      setQuery("");
      setHighlightedIndex(-1);
      return;
    }

    // Fallback: use the current query as before
    const trimmed = query.trim();
    if (!trimmed) return;
    const normalized = /[^a-z0-9-]/i.test(trimmed) ? trimmed : trimmed.toUpperCase();
    onSelect({ code: normalized, name: normalized });
    setQuery("");
    setHighlightedIndex(-1);
  };

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
            placeholder="Search biomarkers (name or ELAB code)"
          />
        </div>
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          Add to panel
        </button>
      </div>
      {query.length >= 2 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/95 shadow-2xl shadow-slate-950/40 backdrop-blur">
          {suggestions.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {suggestions.map((item, index) => {
                const display = item.elab_code ?? item.slug ?? item.name;
                const selection = item.elab_code
                  ? item.elab_code.toUpperCase()
                  : (item.slug ?? item.name);
                const isHighlighted = index === highlightedIndex;
                return (
                  <li key={`${item.name}-${display}`}>
                    <button
                      type="button"
                      onClick={() => handleSubmit(selection, item.name)}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                        isHighlighted
                          ? "bg-emerald-400/20 text-white"
                          : "hover:bg-slate-800/70 text-slate-200"
                      }`}
                    >
                      <span className={`font-medium ${
                        isHighlighted ? "text-white" : "text-slate-100"
                      }`}>
                        {item.name}
                      </span>
                      {display && (
                        <span className={`text-xs uppercase tracking-wide ${
                          isHighlighted ? "text-white/90" : "text-emerald-300"
                        }`}>
                          {selection}
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
