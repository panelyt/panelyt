import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountContent from "../account-content";
import { renderWithIntl } from "../../../../test/utils";
import enMessages from "../../../../i18n/messages/en.json";
import { track } from "../../../../lib/analytics";

vi.mock("../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("../../../../components/office-selector", () => ({
  OfficeSelector: () => <div data-testid="office-selector" />,
}));

vi.mock("../../../../hooks/useUserSession", () => ({
  useUserSession: () => ({ data: { registered: true, username: "Egor" }, isLoading: false }),
}));

let telegramSettings: {
  link_token?: string | null;
  bot_username?: string | null;
  link_token_expires_at?: string | null;
  chat_id?: string | null;
  linked_at?: string | null;
  link_url?: string | null;
} | null = null;

const linkTokenMutation = { isPending: false, mutateAsync: vi.fn(), error: null };
const manualLinkMutation = { isPending: false, mutateAsync: vi.fn(), error: null };
const unlinkMutation = { isPending: false, mutateAsync: vi.fn(), error: null };

vi.mock("../../../../hooks/useAccountSettings", () => ({
  useAccountSettings: () => ({
    settingsQuery: { data: { telegram: telegramSettings }, isLoading: false, error: null },
    linkTokenMutation,
    manualLinkMutation,
    unlinkMutation,
  }),
}));

vi.mock("../../../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

const trackMock = vi.mocked(track);
let writeTextMock: ReturnType<typeof vi.fn>;

describe("AccountContent", () => {
  beforeEach(() => {
    telegramSettings = {
      link_token: "abc123",
      bot_username: "PanelytBot",
      link_token_expires_at: "2025-01-01T10:00:00Z",
      chat_id: "123456",
      linked_at: "2024-01-01T10:00:00Z",
      link_url: null,
    };
    linkTokenMutation.mutateAsync.mockClear();
    manualLinkMutation.mutateAsync.mockClear();
    unlinkMutation.mutateAsync.mockClear();
    trackMock.mockClear();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  it("shows a toast when the command is copied", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <>
        <Toaster />
        <AccountContent />
      </>,
    );

    await user.click(
      screen.getByRole("button", { name: enMessages.account.copyCommand }),
    );

    expect(await screen.findByText("Telegram command copied.")).toBeInTheDocument();
  });

  it("tracks and toasts when the bot link is opened", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <>
        <Toaster />
        <AccountContent />
      </>,
    );

    await user.click(
      screen.getByRole("link", { name: enMessages.account.openBot }),
    );

    expect(trackMock).toHaveBeenCalledWith("telegram_link_opened");
    expect(await screen.findByText("Telegram bot opened.")).toBeInTheDocument();
  });
});
