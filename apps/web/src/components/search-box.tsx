"use client";

import { useState } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { useBiomarkerSearch } from "../hooks/useBiomarkerSearch";

interface Props {
  onSelect: (biomarker: string) => void;
}

export function SearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 200);
  const { data, isFetching } = useBiomarkerSearch(debounced);
  const suggestions = data?.results ?? [];

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = /[^a-z0-9-]/i.test(trimmed) ? trimmed : trimmed.toUpperCase();
    onSelect(normalized);
    setQuery("");
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
              handleSubmit(query);
            }
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          placeholder="Search biomarkers (name or ELAB code)"
        />
        <button
          type="button"
          onClick={() => handleSubmit(query)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600"
        >
          Add
        </button>
      </div>
      {query.length >= 2 && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow">
          {suggestions.map((item) => {
            const display = item.elab_code ?? item.slug ?? item.name;
            const selection = item.elab_code
              ? item.elab_code.toUpperCase()
              : (item.slug ?? item.name);
            return (
              <li key={`${item.name}-${display}`}>
                <button
                  type="button"
                  onClick={() => handleSubmit(selection)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-100"
                >
                  <span className="font-medium text-slate-800">{item.name}</span>
                  {display && (
                    <span className="text-xs uppercase text-slate-500">{selection}</span>
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
