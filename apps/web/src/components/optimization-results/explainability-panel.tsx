import type { OptimizationViewModel } from "./view-model";

interface ExplainabilityPanelProps {
  viewModel: OptimizationViewModel;
}

export function ExplainabilityPanel({ viewModel }: ExplainabilityPanelProps) {
  const { isDark, explainability } = viewModel;

  if (explainability.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-3xl border p-6 shadow-xl ${
        isDark ? "border-slate-800 bg-slate-900/80 shadow-black/30" : "border-slate-200 bg-white"
      }`}
    >
      <h3
        className={`text-lg font-semibold ${
          isDark ? "text-white" : "text-slate-900"
        }`}
      >
        Coverage explainability
      </h3>
      <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        Understand which items satisfy each biomarker requirement.
      </p>
      <div className="mt-4 space-y-3">
        {explainability.map((entry) => (
          <div
            key={entry.token}
            className={`rounded-2xl border p-3 ${
              isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-100 bg-slate-50"
            }`}
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-2 text-sm ${
                isDark ? "text-slate-300" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    entry.isCovered
                      ? isDark
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-emerald-200/70 text-emerald-900"
                      : isDark
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-amber-200/80 text-amber-800"
                  }`}
                >
                  {entry.displayName}
                </span>
                {!entry.isCovered && (
                  <span
                    className={`text-xs uppercase tracking-wide ${
                      isDark ? "text-amber-300" : "text-amber-600"
                    }`}
                  >
                    Missing
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] uppercase tracking-wide ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {entry.packages.length} item{entry.packages.length === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className={`mt-2 flex flex-wrap gap-2 text-xs ${
                isDark ? "text-slate-300" : "text-slate-600"
              }`}
            >
              {entry.packages.map((itemName) => (
                <span
                  key={itemName}
                  className={`rounded-full px-3 py-1 shadow-sm ${
                    isDark ? "bg-slate-800" : "bg-white"
                  }`}
                >
                  {itemName}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
