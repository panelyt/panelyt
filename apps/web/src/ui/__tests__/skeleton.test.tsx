import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "../skeleton";

describe("Skeleton", () => {
  it("renders as a presentation element", () => {
    render(<Skeleton className="h-4 w-24" />);

    const skeleton = screen.getByRole("presentation", { hidden: true });
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
  });
});
