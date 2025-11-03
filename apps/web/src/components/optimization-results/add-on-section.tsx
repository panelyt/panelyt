"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";

import type { OptimizationViewModel } from "./view-model";

interface AddOnSuggestionsSectionProps {
  viewModel: OptimizationViewModel;
  onAdd?: (biomarkers: Array<{ code: string; name: string }>) => void;
}

export function AddOnSuggestionsSection({ viewModel, onAdd }: AddOnSuggestionsSectionProps) {
  const { addOnSuggestions, isDark } = viewModel;

  if (addOnSuggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-6 rounded-2xl border p-5 ${
        isDark
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-emerald-200/80 bg-emerald-50"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles
            className={`h-4 w-4 ${isDark ? "text-emerald-300" : "text-emerald-600"}`}
          />
          <span className={isDark ? "text-emerald-200" : "text-emerald-700"}>
            Cheap add-on suggestions
          </span>
        </div>
        <p
          className={`text-xs sm:text-sm ${
            isDark ? "text-emerald-100/80" : "text-emerald-700/80"
          }`}
        >
          Upgrade selected tests to bundles and pick up bonus biomarkers for a few zł more.
        </p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {addOnSuggestions.map((suggestion) => (
          <article
            key={suggestion.item.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (!onAdd) {
                return;
              }
              const additions = suggestion.bonusTokens.map((token) => ({
                code: token.code,
                name: token.displayName || token.code,
              }));
              if (additions.length > 0) {
                onAdd(additions);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!onAdd) {
                  return;
                }
                const additions = suggestion.bonusTokens.map((token) => ({
                  code: token.code,
                  name: token.displayName || token.code,
                }));
                if (additions.length > 0) {
                  onAdd(additions);
                }
              }
            }}
            className={`rounded-xl border p-4 transition ${
              isDark
                ? "border-slate-800 bg-slate-900/80 hover:border-emerald-400/50 hover:bg-slate-900"
                : "border-white bg-white/90 shadow-sm hover:border-emerald-200 hover:bg-emerald-50/70"
            } cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-2 focus:ring-offset-transparent`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <a
                  href={suggestion.item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1 text-sm font-semibold ${
                    isDark ? "text-slate-100 hover:text-emerald-300" : "text-slate-900 hover:text-emerald-700"
                  }`}
                >
                  {suggestion.item.name}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
                <p className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Already covering{" "}
                  {suggestion.matchedTokens.map((token) => token.displayName).join(", ")}.
                  Add this package to also get:
                </p>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  {suggestion.bonusTokens.map((token) => (
                    <span
                      key={`new-${token.code}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                        isDark
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-emerald-200/70 text-emerald-900"
                      }`}
                    >
                      <Sparkles className="h-3 w-3 flex-shrink-0" />
                      {token.displayName}
                    </span>
                  ))}
                  {suggestion.alreadyCoveredTokens.map((token) => (
                    <span
                      key={`existing-${token.code}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                        isDark
                          ? "bg-slate-800 text-slate-300"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {token.displayName}
                    </span>
                  ))}
                  {suggestion.removedBonusTokens.map((token) => (
                    <span
                      key={`removed-${token.code}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                        isDark
                          ? "bg-red-500/30 text-red-100"
                          : "bg-red-100 text-red-700"
                      }`}
                      title="Losing this bonus biomarker by switching to this package"
                    >
                      {token.displayName}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`text-right text-xs ${
                  isDark ? "text-emerald-200/80" : "text-emerald-700/80"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide">Upgrade cost</p>
                <p
                  className={`text-lg font-semibold ${
                    isDark ? "text-white" : "text-emerald-700"
                  }`}
                >
                  +{suggestion.incrementalLabel}
                </p>
                {suggestion.bonusCount > 0 && (
                  <p className="mt-1 text-[11px]">
                    ≈ {suggestion.perBonusLabel} per biomarker
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
