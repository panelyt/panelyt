import { CircleAlert, CircleCheck } from "lucide-react";

import type { OptimizationViewModel } from "./view-model";

interface CoverageSectionProps {
  viewModel: OptimizationViewModel;
}

export function CoverageSection({ viewModel }: CoverageSectionProps) {
  const { isDark, coverage, selected, displayNameFor } = viewModel;
  const uncoveredTokens = coverage.uncoveredTokens;
  const coveredTokens = coverage.coveredTokens;

  return (
    <div
      className={`mt-8 rounded-xl border p-4 ${
        isDark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className={`flex items-center gap-2 text-sm font-medium ${
            isDark ? "text-slate-200" : "text-slate-700"
          }`}
        >
          <CircleCheck className="h-4 w-4 text-emerald-500" />
          Coverage
        </div>
        <p
          className={`text-xs uppercase tracking-wide ${
            isDark ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {coveredTokens.length} covered · {selected.length - coveredTokens.length} uncovered
        </p>
      </div>
      <div
        className={`mt-3 h-2 rounded-full ${
          isDark ? "bg-slate-800" : "bg-slate-200"
        }`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500"
          style={{ width: `${coverage.percent}%` }}
        />
      </div>
      {uncoveredTokens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {uncoveredTokens.map((token) => (
            <span
              key={token}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium ${
                isDark
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <CircleAlert className="h-3.5 w-3.5" />
              {displayNameFor(token)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
