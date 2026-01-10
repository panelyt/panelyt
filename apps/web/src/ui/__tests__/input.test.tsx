import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "../input";

describe("Input", () => {
  it("renders a labeled textbox", () => {
    render(<Input aria-label="Search" value="" onChange={() => undefined} />);

    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });

  it("shows a clear button only when there is a value and clears on click", async () => {
    const user = userEvent.setup();

    function ControlledInput() {
      const [value, setValue] = useState("thyroid");
      return (
        <Input
          aria-label="Search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          clearable
        />
      );
    }

    render(<ControlledInput />);

    const input = screen.getByRole("textbox", { name: "Search" });
    expect(input).toHaveValue("thyroid");

    const clearButton = screen.getByRole("button", { name: /clear input/i });
    expect(clearButton).toHaveClass("h-9", "w-9");
    await user.click(clearButton);

    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: /clear input/i })).not.toBeInTheDocument();
  });
});
