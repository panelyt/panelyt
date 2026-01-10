import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SegmentedControl } from "../segmented-control";

describe("SegmentedControl", () => {
  it("uses hit target sizes for tabs", () => {
    render(
      <SegmentedControl
        value="updated"
        options={[
          { value: "updated", label: "Updated" },
          { value: "count", label: "Biomarkers" },
        ]}
        onValueChange={() => undefined}
        ariaLabel="Sort by"
      />,
    );

    expect(screen.getByRole("tab", { name: "Updated" })).toHaveClass("h-9");
    expect(screen.getByRole("tab", { name: "Biomarkers" })).toHaveClass("h-9");
  });
});
