import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../button";

describe("Button", () => {
  it("disables and shows a spinner when loading", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();

    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
