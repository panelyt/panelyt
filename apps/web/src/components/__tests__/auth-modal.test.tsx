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

  it("shows validation feedback and disables submit when credentials are invalid", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const validCredential = "longenough";

    renderWithIntl(
      <AuthModal
        open
        mode="login"
        onModeChange={vi.fn()}
        onClose={vi.fn()}
        onLogin={onLogin}
        onRegister={vi.fn().mockResolvedValue(undefined)}
        isLoggingIn={false}
        isRegistering={false}
        error={null}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Sign in" });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Username"), "ab");
    await user.type(screen.getByLabelText("Password"), "short");

    expect(
      screen.getByText("Username must be at least 3 characters."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "valid-user");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), validCredential);

    expect(
      screen.queryByText("Username must be at least 3 characters."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Password must be at least 8 characters."),
    ).not.toBeInTheDocument();
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(onLogin).toHaveBeenCalledWith({
      username: "valid-user",
      password: validCredential,
    });
  });

  it("shows confirmation feedback in register mode", async () => {
    const user = userEvent.setup();
    const validCredential = "longenough";

    renderWithIntl(
      <AuthModal
        open
        mode="register"
        onModeChange={vi.fn()}
        onClose={vi.fn()}
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onRegister={vi.fn().mockResolvedValue(undefined)}
        isLoggingIn={false}
        isRegistering={false}
        error={null}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Create account" });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Username"), "valid-user");
    await user.type(screen.getByLabelText("Password"), validCredential);
    await user.type(screen.getByLabelText("Confirm password"), "nomatch");

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), validCredential);

    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
    expect(submitButton).toBeEnabled();
  });
});
