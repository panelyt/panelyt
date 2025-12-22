import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ListsContent from "../lists-content";
import enMessages from "../../../../i18n/messages/en.json";
import plMessages from "../../../../i18n/messages/pl.json";

vi.mock("../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("../../../../hooks/useUserSession", () => ({
  useUserSession: () => ({ data: { registered: true, username: "Egor" }, isLoading: false }),
}));

vi.mock("../../../../hooks/useAccountSettings", () => ({
  useAccountSettings: () => ({ settingsQuery: { data: { telegram: { chat_id: "123" } } } }),
}));

let listsData: Array<{
  id: string;
  name: string;
  biomarkers: Array<{
    id: string;
    code: string;
    display_name: string;
    sort_order: number;
    biomarker_id: string | null;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
  share_token: string | null;
  shared_at: string | null;
  notify_on_price_drop: boolean;
  last_known_total_grosz: number | null;
  last_total_updated_at: string | null;
  last_notified_total_grosz: number | null;
  last_notified_at: string | null;
}> = [];

const buildSavedLists = () => ({
  listsQuery: { data: listsData, isLoading: false },
  shareMutation: { isPending: false, mutateAsync: vi.fn() },
  unshareMutation: { isPending: false, mutateAsync: vi.fn() },
  notificationsMutation: { isPending: false, variables: undefined, mutate: vi.fn() },
  notificationsBulkMutation: { isPending: false, mutate: vi.fn() },
  deleteMutation: { mutateAsync: vi.fn() },
});

vi.mock("../../../../hooks/useSavedLists", () => ({
  useSavedLists: () => buildSavedLists(),
}));

const renderWithIntl = (
  locale: "en" | "pl",
  messages: typeof enMessages | typeof plMessages,
) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ListsContent />
    </NextIntlClientProvider>,
  );

describe("ListsContent", () => {
  it("includes locale prefix in shared list links", async () => {
    listsData = [
      {
        id: "list-1",
        name: "Shared list",
        biomarkers: [],
        created_at: "",
        updated_at: "",
        share_token: "token-123",
        shared_at: "2024-01-01T10:00:00Z",
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    renderWithIntl("en", enMessages);

    const expectedUrl = `${window.location.origin}/en/collections/shared/token-123`;
    expect(await screen.findByText(expectedUrl)).toBeInTheDocument();
  });

  it("shows a localized totals error message", async () => {
    listsData = [
      {
        id: "list-2",
        name: "Totals list",
        biomarkers: [],
        created_at: "",
        updated_at: "",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    const promiseAllSpy = vi.spyOn(Promise, "all").mockRejectedValueOnce(new Error("boom"));

    renderWithIntl("pl", plMessages);

    await waitFor(() => {
      expect(
        screen.getByText(plMessages.errors.failedToCalculateTotals),
      ).toBeInTheDocument();
    });

    promiseAllSpy.mockRestore();
  });
});
