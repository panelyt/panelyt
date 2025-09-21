"use client";

import { useState, useEffect } from "react";
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
  const suggestions = data?.results ?? [];

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
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="Search biomarkers (name or ELAB code)"
        />
        <button
          type="button"
          onClick={() => handleSubmit()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600"
        >
          Add
        </button>
      </div>
      {query.length >= 2 && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow">
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
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    isHighlighted
                      ? "bg-brand text-white"
                      : "hover:bg-slate-100"
                  }`}
                >
                  <span className={`font-medium ${
                    isHighlighted ? "text-white" : "text-slate-800"
                  }`}>
                    {item.name}
                  </span>
                  {display && (
                    <span className={`text-xs uppercase ${
                      isHighlighted ? "text-white/80" : "text-slate-500"
                    }`}>
                      {selection}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {isFetching && (
        <p className="mt-2 text-xs text-slate-500">Searching…</p>
      )}
    </div>
  );
}
