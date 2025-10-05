import { ExplainabilityPanel } from "./explainability-panel";
import { KeyInsights } from "./key-insights";
import type { OptimizationViewModel } from "./view-model";

interface InsightsSectionProps {
  viewModel: OptimizationViewModel;
  showInsights: boolean;
  showExplainability: boolean;
}

export function InsightsSection({
  viewModel,
  showInsights,
  showExplainability,
}: InsightsSectionProps) {
  if (!showInsights && !showExplainability) {
    return null;
  }

  return (
    <section className="space-y-6">
      {showInsights && <KeyInsights viewModel={viewModel} />}
      {showExplainability && <ExplainabilityPanel viewModel={viewModel} />}
    </section>
  );
}
