import { CircleAlert } from "lucide-react";

import type { OptimizationViewModel } from "./view-model";

interface ExclusiveSectionProps {
  viewModel: OptimizationViewModel;
}

export function ExclusiveSection({ viewModel }: ExclusiveSectionProps) {
  const { exclusive, isDark } = viewModel;

  if (exclusive.biomarkers.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-6 rounded-xl border p-4 ${
        isDark ? "border-amber-500/40 bg-amber-500/10" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
        <CircleAlert className="h-4 w-4" />
        <span>Exclusive to {exclusive.labTitle}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {exclusive.biomarkers.map((biomarker) => (
          <li
            key={biomarker.code}
            className={`rounded-full px-3 py-1 ${
              isDark ? "bg-amber-500/20 text-amber-100" : "bg-amber-100 text-amber-700"
            }`}
          >
            {biomarker.displayName}
          </li>
        ))}
      </ul>
    </div>
  );
}
