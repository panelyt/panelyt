"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CatalogSearchResult } from "@panelyt/types";

import { useDebounce } from "@/hooks/useDebounce";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import { formatGroszToPln } from "@/lib/format";
import { SEARCH_PREFILL_EVENT } from "@/features/optimizer/search-events";

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
  hotkeyScope?: "global" | "panel-tray";
}

export function SearchBox({
  onSelect,
  onTemplateSelect,
  hotkeyScope = "global",
}: Props) {
  const t = useTranslations();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tipDismissedKey = "panelyt-search-tip-dismissed";
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [enterHintVisible, setEnterHintVisible] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const debounced = useDebounce(query, 200);
  const { data, isFetching } = useCatalogSearch(debounced);
  const suggestions = useMemo<CatalogSearchResult[]>(
    () => data?.results ?? [],
    [data?.results],
  );
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [slowNoticeVisible, setSlowNoticeVisible] = useState(false);

  const biomarkerSuggestions = useMemo(
    () => suggestions.filter((item) => item.type !== "template"),
    [suggestions],
  );
  const templateSuggestions = useMemo(
    () => suggestions.filter((item) => item.type === "template"),
    [suggestions],
  );
  const flatSuggestions = useMemo(
    () => [...biomarkerSuggestions, ...templateSuggestions],
    [biomarkerSuggestions, templateSuggestions],
  );

  const optionIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flatSuggestions.forEach((item, index) => {
      map.set(`${item.type}-${item.id}`, index);
    });
    return map;
  }, [flatSuggestions]);

  const activeOptionId =
    highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined;

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [flatSuggestions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const dismissed = sessionStorage.getItem(tipDismissedKey) === "true";
    if (dismissed) {
      setTipDismissed(true);
    }
  }, [tipDismissedKey]);

  useEffect(() => {
    if (!pendingQuery) {
      return;
    }
    const normalized = query.trim().toLowerCase();
    if (normalized !== pendingQuery) {
      setPendingQuery(null);
    }
  }, [query, pendingQuery]);

  const dismissTip = useCallback(() => {
    if (tipDismissed) {
      return;
    }
    setTipDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(tipDismissedKey, "true");
    }
  }, [tipDismissed, tipDismissedKey]);

  const commitSuggestion = useCallback(
    (suggestion: CatalogSearchResult) => {
      setEnterHintVisible(false);
      dismissTip();
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
    [dismissTip, onSelect, onTemplateSelect],
  );

  const handleSubmit = () => {
    setEnterHintVisible(false);
    if (highlightedIndex >= 0 && highlightedIndex < flatSuggestions.length) {
      const selectedResult = flatSuggestions[highlightedIndex];
      commitSuggestion(selectedResult);
      return;
    }

    if (flatSuggestions.length > 0) {
      commitSuggestion(flatSuggestions[0]);
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
    setEnterHintVisible(true);
  };

  useEffect(() => {
    if (!pendingQuery) {
      return;
    }

    const normalizedDebounced = debounced.trim().toLowerCase();

    if (normalizedDebounced !== pendingQuery) {
      return;
    }

    if (flatSuggestions.length === 0) {
      if (!isFetching) {
        setPendingQuery(null);
        setEnterHintVisible(true);
      }
      return;
    }

    commitSuggestion(flatSuggestions[0]);
  }, [pendingQuery, flatSuggestions, debounced, isFetching, commitSuggestion]);

  const showSuggestions = query.length >= 2;

  useEffect(() => {
    if (!isFetching || !showSuggestions) {
      setSlowNoticeVisible(false);
      return;
    }

    setSlowNoticeVisible(false);
    const timer = window.setTimeout(() => {
      setSlowNoticeVisible(true);
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debounced, isFetching, showSuggestions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const activeScope = document.body.dataset.searchHotkeyScope ?? "global";
      if (activeScope !== hotkeyScope) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hotkeyScope]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      const next = detail?.code?.trim();
      if (!next) {
        return;
      }
      setQuery(next);
      setEnterHintVisible(false);
      setPendingQuery(null);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    };

    window.addEventListener(SEARCH_PREFILL_EVENT, handlePrefill as EventListener);
    return () => window.removeEventListener(SEARCH_PREFILL_EVENT, handlePrefill as EventListener);
  }, []);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setEnterHintVisible(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((prev) =>
                  prev < flatSuggestions.length - 1 ? prev + 1 : prev,
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
              } else if (event.key === "Escape") {
                event.preventDefault();
                setHighlightedIndex(-1);
                setQuery("");
                setEnterHintVisible(false);
              }
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-10 pr-16 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            placeholder={t("home.searchPlaceholder")}
            role="combobox"
            aria-label={t("home.searchPlaceholder")}
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? listId : undefined}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
          />
          {!tipDismissed && !isFetching && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {t("home.searchInlineHint")}
            </span>
          )}
        </div>
      </div>
      {showSuggestions && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/95 shadow-2xl shadow-slate-950/40 backdrop-blur">
          {flatSuggestions.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto" role="listbox" id={listId}>
              {biomarkerSuggestions.length > 0 && (
                <li className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400" role="presentation">
                  {t("home.groupBiomarkers")}
                </li>
              )}
              {biomarkerSuggestions.map((item) => {
                const optionKey = `${item.type}-${item.id}`;
                const optionIndex = optionIndexByKey.get(optionKey) ?? -1;
                const isHighlighted = optionIndex === highlightedIndex;
                const priceLabel =
                  item.price_now_grosz !== null && item.price_now_grosz !== undefined
                    ? formatGroszToPln(item.price_now_grosz)
                    : t("common.placeholderDash");
                return (
                  <li key={optionKey}>
                    <button
                      type="button"
                      onClick={() => commitSuggestion(item)}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                        isHighlighted
                          ? "bg-emerald-400/20 text-white"
                          : "hover:bg-slate-800/70 text-slate-200"
                      }`}
                      role="option"
                      aria-selected={isHighlighted}
                      id={`${listId}-option-${optionIndex}`}
                    >
                      <div className="flex flex-col gap-1">
                        <span
                          className={`font-medium ${
                            isHighlighted ? "text-white" : "text-slate-100"
                          }`}
                        >
                          {item.name}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 text-xs">
                        <span
                          className={[
                            "font-semibold",
                            isHighlighted ? "text-white" : "text-emerald-200",
                          ].join(" ")}
                        >
                          {priceLabel}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
              {templateSuggestions.length > 0 && (
                <li className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400" role="presentation">
                  {t("home.groupTemplates")}
                </li>
              )}
              {templateSuggestions.map((item) => {
                const optionKey = `${item.type}-${item.id}`;
                const optionIndex = optionIndexByKey.get(optionKey) ?? -1;
                const isHighlighted = optionIndex === highlightedIndex;
                const templateDescription = item.description?.trim() ?? "";
                return (
                  <li key={optionKey}>
                    <button
                      type="button"
                      onClick={() => commitSuggestion(item)}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                        isHighlighted
                          ? "bg-emerald-400/20 text-white"
                          : "hover:bg-slate-800/70 text-slate-200"
                      }`}
                      role="option"
                      aria-selected={isHighlighted}
                      id={`${listId}-option-${optionIndex}`}
                    >
                      <div className="flex flex-col gap-1">
                        <span
                          className={`font-medium ${
                            isHighlighted ? "text-white" : "text-slate-100"
                          }`}
                        >
                          {item.name}
                        </span>
                        <span
                          className={`text-[11px] uppercase tracking-wide ${
                            isHighlighted ? "text-white/80" : "text-amber-300"
                          }`}
                        >
                          {t("common.template")} · {t("common.biomarkersCount", { count: item.biomarker_count })}
                        </span>
                      </div>
                      <span
                        className={`truncate text-xs ${
                          isHighlighted ? "text-white/80" : "text-slate-300"
                        }`}
                      >
                        {templateDescription ||
                          `${t("common.template")} · ${t("common.biomarkersCount", { count: item.biomarker_count })}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 text-xs text-slate-300">
              <SparklesNote />
              <span>{t("home.noMatches")}</span>
            </div>
          )}
        </div>
      )}
      {isFetching && (
        <div className="absolute right-4 top-2.5 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("home.searching")}</span>
        </div>
      )}
      {slowNoticeVisible && (
        <p className="mt-2 text-xs text-slate-400">{t("home.priceUpdateNotice")}</p>
      )}
      {enterHintVisible && (
        <p className="mt-2 text-xs text-slate-500">{t("home.enterHint")}</p>
      )}
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
