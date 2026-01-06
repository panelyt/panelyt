import { screen } from "@testing-library/react";
import { describe, it, beforeEach, expect } from "vitest";

import { renderWithIntl } from "@/test/utils";
import { usePanelStore } from "@/stores/panelStore";
import { PanelPill } from "@/features/panel/PanelPill";
import { formatCurrency } from "@/lib/format";

const setSelection = (count: number) => {
  usePanelStore.setState({
    selected: Array.from({ length: count }, (_, index) => ({
      code: `T${index + 1}`,
      name: `Test ${index + 1}`,
    })),
    lastOptimizationSummary: undefined,
    lastRemoved: undefined,
  });
};

describe("PanelPill", () => {
  beforeEach(() => {
    sessionStorage.clear();
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined, lastRemoved: undefined });
  });

  it("shows a run optimize prompt when no summary is cached", () => {
    setSelection(2);

    renderWithIntl(<PanelPill />);

    expect(screen.getByText("2 biomarkers")).toBeInTheDocument();
    expect(screen.getByText("Run optimize")).toBeInTheDocument();
    expect(screen.getByLabelText("Optimization pending")).toBeInTheDocument();
  });

  it("shows the cached best total when available", () => {
    setSelection(3);
    usePanelStore.setState({
      lastOptimizationSummary: {
        labCode: "diag",
        totalNow: 120,
        totalMin30: 100,
        uncoveredCount: 0,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });

    renderWithIntl(<PanelPill />);

    expect(screen.getByText("3 biomarkers")).toBeInTheDocument();
    const expected = formatCurrency(120).replace(/\u00a0/g, " ");
    expect(
      screen.getByText((content) => content.replace(/\u00a0/g, " ") === expected),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("All biomarkers covered")).toBeInTheDocument();
  });
});
