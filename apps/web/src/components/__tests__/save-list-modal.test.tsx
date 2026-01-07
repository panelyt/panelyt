import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SaveListModal } from "@/components/save-list-modal";
import { renderWithIntl } from "@/test/utils";

describe("SaveListModal", () => {
  it("renders a dialog and submits", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    const { unmount } = renderWithIntl(
      <SaveListModal
        open
        name=""
        error={null}
        isSaving={false}
        onNameChange={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Save current selection" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save list" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("calls onClose when the close button is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { unmount } = renderWithIntl(
      <SaveListModal
        open
        name=""
        error={null}
        isSaving={false}
        onNameChange={vi.fn()}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Close save dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
