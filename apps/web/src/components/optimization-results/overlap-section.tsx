import type { OptimizationViewModel } from "./view-model";

interface OverlapSectionProps {
  viewModel: OptimizationViewModel;
}

export function OverlapSection({ viewModel }: OverlapSectionProps) {
  const { overlaps, isDark } = viewModel;

  if (overlaps.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-6 rounded-xl border p-4 ${
        isDark ? "border-amber-400/40 bg-amber-500/10" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3
            className={`text-sm font-semibold uppercase tracking-wide ${
              isDark ? "text-amber-200" : "text-amber-700"
            }`}
          >
            Package overlaps
          </h3>
          <p className={`text-xs ${isDark ? "text-amber-100/80" : "text-amber-700/80"}`}>
            These biomarkers appear in multiple packages. Consider staggering them to avoid redundant
            testing.
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {overlaps.map((entry) => (
          <li
            key={entry.code}
            className={`rounded-lg border p-3 ${
              isDark
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                : "border-amber-200 bg-white text-amber-800"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isDark
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {entry.displayName}
                </span>
                <span
                  className={`text-[11px] uppercase tracking-wide ${
                    isDark ? "text-amber-200/70" : "text-amber-600/70"
                  }`}
                >
                  {entry.packages.length} packages
                </span>
              </div>
            </div>
            <div className={`mt-2 flex flex-wrap gap-2 text-xs ${isDark ? "text-amber-100" : "text-amber-700"}`}>
              {entry.packages.map((itemName) => (
                <span
                  key={itemName}
                  className={`rounded-full px-3 py-1 ${
                    isDark
                      ? "bg-amber-400/20 text-amber-100"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {itemName}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
