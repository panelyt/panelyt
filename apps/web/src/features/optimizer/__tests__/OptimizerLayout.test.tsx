import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OptimizerLayout } from "../OptimizerLayout";

describe("OptimizerLayout", () => {
  it("renders left and right rails", () => {
    render(
      <OptimizerLayout
        left={<div>Left rail</div>}
        right={<div>Right rail</div>}
      />,
    );

    expect(screen.getByText("Left rail")).toBeInTheDocument();
    expect(screen.getByText("Right rail")).toBeInTheDocument();
  });

  it("uses the two-rail grid on xl", () => {
    const { getByTestId } = render(
      <OptimizerLayout left={<div />} right={<div />} />,
    );

    expect(getByTestId("optimizer-layout")).toHaveClass("grid");
    expect(getByTestId("optimizer-layout")).toHaveClass("xl:grid-cols-[2fr_3fr]");
  });
});
