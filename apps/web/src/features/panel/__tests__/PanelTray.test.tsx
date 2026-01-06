import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithQueryClient } from "@/test/utils";
import { usePanelStore } from "@/stores/panelStore";
import { PanelTray } from "@/features/panel/PanelTray";
import { formatCurrency } from "@/lib/format";

vi.mock("@/hooks/useUserSession", () => ({
  useUserSession: () => ({ data: null, isLoading: false }),
}));

describe("PanelTray", () => {
  beforeEach(() => {
    sessionStorage.clear();
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined, lastRemoved: undefined });
  });

  it("renders selected biomarkers and removes them", async () => {
    usePanelStore.setState({
      selected: [
        { code: "ALT", name: "Alanine aminotransferase" },
        { code: "AST", name: "Aspartate aminotransferase" },
      ],
    });

    const user = userEvent.setup();
    renderWithQueryClient(<PanelTray />);

    await user.click(screen.getAllByRole("button", { name: /open panel tray/i })[0]);

    expect(screen.getByText("Alanine aminotransferase")).toBeInTheDocument();
    expect(screen.getByText("Aspartate aminotransferase")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Remove Alanine aminotransferase"));

    expect(screen.queryByText("Alanine aminotransferase")).not.toBeInTheDocument();
    expect(usePanelStore.getState().selected).toHaveLength(1);
  });

  it("shows the cached optimization summary when available", async () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "Alanine aminotransferase" }],
      lastOptimizationSummary: {
        labCode: "diag",
        totalNow: 120,
        totalMin30: 100,
        uncoveredCount: 0,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });

    const user = userEvent.setup();
    renderWithQueryClient(<PanelTray />);

    await user.click(screen.getAllByRole("button", { name: /open panel tray/i })[0]);

    const totalLabel = formatCurrency(120).replace(/\u00a0/g, " ");
    const savingsLabel = formatCurrency(20).replace(/\u00a0/g, " ");

    expect(
      screen.getAllByText((content) => content.replace(/\u00a0/g, " ") === totalLabel)
        .length,
    ).toBeGreaterThan(1);
    expect(
      screen.getByText((content) => {
        const normalized = content.replace(/\u00a0/g, " ");
        return normalized.includes("30-day floor") && normalized.includes(savingsLabel);
      }),
    ).toBeInTheDocument();
  });

  it("renders a mobile tray trigger that opens the dialog", async () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "Alanine aminotransferase" }],
    });

    const user = userEvent.setup();
    renderWithQueryClient(<PanelTray />);

    await user.click(screen.getByTestId("panel-tray-mobile"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("focuses the tray search when pressing /", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<PanelTray />);

    await user.click(screen.getAllByRole("button", { name: /open panel tray/i })[0]);

    const input = await screen.findByRole("combobox", {
      name: "Search biomarkers to add...",
    });

    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: "/" });

    expect(input).toHaveFocus();
  });
});
