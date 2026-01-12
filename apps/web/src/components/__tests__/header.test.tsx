import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test/utils";
import { Header } from "../header";

vi.mock("../../hooks/useUserSession", () => ({
  useUserSession: vi.fn(),
}));

vi.mock("../../hooks/useAuthModal", () => ({
  useAuthModal: vi.fn(),
}));

vi.mock("../auth-modal", () => ({
  AuthModal: () => null,
}));

vi.mock("../language-switcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("../office-selector", () => ({
  OfficeSelector: () => <div data-testid="office-selector" />,
}));

vi.mock("../../features/panel/PanelTray", () => ({
  PanelTray: () => <div data-testid="panel-tray" />,
}));

import { useUserSession } from "../../hooks/useUserSession";
import { useAuthModal } from "../../hooks/useAuthModal";

const mockUseUserSession = vi.mocked(useUserSession);
const mockUseAuthModal = vi.mocked(useAuthModal);

const authModalStub = {
  isOpen: false,
  mode: "login" as const,
  open: vi.fn(),
  close: vi.fn(),
  setMode: vi.fn(),
  handleLogin: vi.fn(),
  handleRegister: vi.fn(),
  handleLogout: vi.fn(),
  isLoggingIn: false,
  isRegistering: false,
  isLoggingOut: false,
  error: null,
};

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders account dropdown for logged-in users", async () => {
    mockUseUserSession.mockReturnValue({
      data: { registered: true, username: "egor" },
      isLoading: false,
    } as any);
    mockUseAuthModal.mockReturnValue(authModalStub as any);

    const user = userEvent.setup();
    renderWithIntl(<Header />);

    await user.click(screen.getByRole("button", { name: "egor" }));

    expect(screen.getByRole("menuitem", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(authModalStub.handleLogout).toHaveBeenCalled();
  });

  it("shows sign in and register buttons when logged out", () => {
    mockUseUserSession.mockReturnValue({ data: null, isLoading: false } as any);
    mockUseAuthModal.mockReturnValue(authModalStub as any);

    renderWithIntl(<Header />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });
});
