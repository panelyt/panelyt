import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StickySummaryBar } from "../StickySummaryBar";

describe("StickySummaryBar", () => {
  it("does not render when not visible", () => {
    const { queryByTestId } = render(<StickySummaryBar isVisible={false} />);

    expect(queryByTestId("sticky-summary-bar")).not.toBeInTheDocument();
  });

  it("renders slot content when visible", () => {
    render(
      <StickySummaryBar
        isVisible
        source={<span>Source</span>}
        total={<span>Total</span>}
        savings={<span>Savings</span>}
        actions={<button type="button">Share</button>}
      />,
    );

    expect(screen.getByTestId("sticky-summary-bar")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Savings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });
});
