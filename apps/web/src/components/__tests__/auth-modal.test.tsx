import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthModal } from "@/components/auth-modal";
import enMessages from "@/i18n/messages/en.json";
import { renderWithIntl } from "@/test/utils";

describe("AuthModal", () => {
  it("renders a dialog and closes when requested", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithIntl(
      <AuthModal
        open
        mode="login"
        onModeChange={vi.fn()}
        onClose={onClose}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onRegister={vi.fn().mockResolvedValue(undefined)}
        isLoggingIn={false}
        isRegistering={false}
        error={null}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Close auth dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the brand name from translations", () => {
    const messages = {
      ...enMessages,
      common: {
        ...enMessages.common,
        brandName: "TestBrand",
      },
    } as typeof enMessages;

    renderWithIntl(
      <AuthModal
        open
        mode="login"
        onModeChange={vi.fn()}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onRegister={vi.fn().mockResolvedValue(undefined)}
        isLoggingIn={false}
        isRegistering={false}
        error={null}
      />,
      { messages },
    );

    expect(screen.getByText("TestBrand")).toBeInTheDocument();
  });
});
