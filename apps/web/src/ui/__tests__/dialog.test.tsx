import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../dialog";

describe("Dialog", () => {
  it("traps focus and closes on Escape", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Outside</button>
        <Dialog>
          <DialogTrigger>Open dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
            <input aria-label="First" autoFocus />
            <button type="button">Confirm</button>
          </DialogContent>
        </Dialog>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    const firstField = screen.getByLabelText("First");
    const confirmButton = screen.getByRole("button", { name: "Confirm" });

    expect(firstField).toHaveFocus();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    await user.tab();
    expect(firstField).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
