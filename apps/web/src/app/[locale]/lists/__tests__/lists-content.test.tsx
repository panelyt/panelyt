import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";

import ListsContent from "../lists-content";
import enMessages from "../../../../i18n/messages/en.json";
import plMessages from "../../../../i18n/messages/pl.json";
import { track } from "../../../../lib/analytics";
import { usePanelStore } from "../../../../stores/panelStore";
import { useRouter } from "../../../../i18n/navigation";

vi.mock("../../../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

vi.mock("../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("../../../../hooks/useUserSession", () => ({
  useUserSession: () => ({ data: { registered: true, username: "Egor" }, isLoading: false }),
}));

vi.mock("../../../../hooks/useAccountSettings", () => ({
  useAccountSettings: () => ({ settingsQuery: { data: { telegram: { chat_id: "123" } } } }),
}));

vi.mock("../../../../i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  getPathname: ({ href, locale }: { href: string; locale?: string }) =>
    locale ? `/${locale}${href}` : href,
  useRouter: vi.fn(),
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

let deleteMutationMock = vi.fn();

const buildSavedLists = () => ({
  listsQuery: { data: listsData, isLoading: false },
  shareMutation: { isPending: false, mutateAsync: vi.fn() },
  unshareMutation: { isPending: false, mutateAsync: vi.fn() },
  notificationsMutation: { isPending: false, variables: undefined, mutate: vi.fn() },
  notificationsBulkMutation: { isPending: false, mutate: vi.fn() },
  deleteMutation: { mutateAsync: deleteMutationMock },
});

vi.mock("../../../../hooks/useSavedLists", () => ({
  useSavedLists: () => buildSavedLists(),
}));

const useRouterMock = vi.mocked(useRouter);
const trackMock = vi.mocked(track);
type Router = ReturnType<typeof useRouter>;
const createRouter = (overrides: Partial<Router> = {}): Router => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  ...overrides,
});

const renderWithIntl = (
  locale: "en" | "pl",
  messages: typeof enMessages | typeof plMessages,
  withToaster = false,
) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {withToaster ? (
        <>
          <Toaster />
          <ListsContent />
        </>
      ) : (
        <ListsContent />
      )}
    </NextIntlClientProvider>,
  );

describe("ListsContent", () => {
  beforeEach(() => {
    useRouterMock.mockReturnValue(createRouter());
    usePanelStore.setState({ selected: [] });
    deleteMutationMock = vi.fn();
    trackMock.mockClear();
  });

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

    const expectedUrl = "/en/collections/shared/token-123";
    const links = await screen.findAllByText(expectedUrl);
    expect(links.length).toBeGreaterThan(0);
  });

  it("shows a placeholder when totals are missing", async () => {
    listsData = [
      {
        id: "list-2",
        name: "Totals list",
        biomarkers: [
          {
            id: "bio-1",
            code: "ALT",
            display_name: "ALT",
            sort_order: 0,
            biomarker_id: "bio-1",
            created_at: "",
          },
        ],
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

    renderWithIntl("pl", plMessages);

    await screen.findAllByText("Totals list");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(plMessages.errors.failedToCalculateTotals),
    ).not.toBeInTheDocument();
  });

  it("renders the lists table with actions", async () => {
    listsData = [
      {
        id: "list-3",
        name: "Checkup",
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

    renderWithIntl("en", enMessages);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Biomarkers" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Updated" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();

    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(
      within(table).getByRole("button", { name: "Actions for Checkup" }),
    );
    expect(await screen.findByRole("menuitem", { name: "Load in optimizer" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("requires confirmation before deleting a list", async () => {
    listsData = [
      {
        id: "list-9",
        name: "Checkup",
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

    const user = userEvent.setup();

    renderWithIntl("en", enMessages);

    const table = await screen.findByRole("table");
    await user.click(
      within(table).getByRole("button", { name: "Actions for Checkup" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(deleteMutationMock).not.toHaveBeenCalled();

    const confirmButton = await screen.findByRole("button", {
      name: enMessages.lists.deleteConfirm,
    });
    await user.click(confirmButton);

    expect(deleteMutationMock).toHaveBeenCalledWith("list-9");
  });

  it("renders overflow actions on mobile cards", async () => {
    listsData = [
      {
        id: "list-3",
        name: "Checkup",
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

    renderWithIntl("en", enMessages);

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Checkup",
    });
    expect(actionButtons).toHaveLength(2);
  });

  it("renders mobile cards without shadows", async () => {
    listsData = [
      {
        id: "list-10",
        name: "Checkup",
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

    renderWithIntl("en", enMessages);

    const card = await screen.findByTestId("list-card-list-10");
    expect(card.className).not.toMatch(/shadow/);
  });

  it("shows summary metrics for lists and alerts", async () => {
    listsData = [
      {
        id: "list-4",
        name: "Baseline",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: true,
        last_known_total_grosz: null,
        last_total_updated_at: "2024-01-02T10:00:00Z",
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
      {
        id: "list-5",
        name: "Follow-up",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-03T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    renderWithIntl("en", enMessages);

    const summary = await screen.findByTestId("lists-summary");
    expect(within(summary).getByText("Lists")).toBeInTheDocument();
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("Alerts enabled")).toBeInTheDocument();
    expect(within(summary).getByText("1")).toBeInTheDocument();
    expect(within(summary).getByText("Last updated")).toBeInTheDocument();
  });

  it("shows bulk alert actions", async () => {
    listsData = [
      {
        id: "list-6",
        name: "Alerts list",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    renderWithIntl("en", enMessages);

    expect(
      await screen.findByRole("button", { name: "Enable all alerts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disable all alerts" }),
    ).toBeInTheDocument();
  });

  it("shows a toast when the share link is copied", async () => {
    listsData = [
      {
        id: "list-7",
        name: "Shared list",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: "token-456",
        shared_at: "2024-01-01T10:00:00Z",
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    const user = userEvent.setup();

    renderWithIntl("en", enMessages, true);

    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Copy link" }));

    expect(trackMock).toHaveBeenCalledWith("share_copy_url", { status: "success" });
    expect(await screen.findByText("Share link copied.")).toBeInTheDocument();
  });

  it("tracks single alert toggles", async () => {
    listsData = [
      {
        id: "list-11",
        name: "Alerts list",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    const user = userEvent.setup();
    renderWithIntl("en", enMessages);

    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "Enable alerts" }));

    expect(trackMock).toHaveBeenCalledWith("alerts_toggle", {
      mode: "single",
      enabled: true,
    });
  });

  it("tracks bulk alert toggles", async () => {
    listsData = [
      {
        id: "list-12",
        name: "Alerts list",
        biomarkers: [],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    const user = userEvent.setup();
    renderWithIntl("en", enMessages);

    await user.click(
      await screen.findByRole("button", { name: "Enable all alerts" }),
    );

    expect(trackMock).toHaveBeenCalledWith("alerts_toggle", {
      mode: "bulk",
      enabled: true,
    });
  });

  it("loads a list into the panel and navigates home", async () => {
    listsData = [
      {
        id: "list-8",
        name: "Optimizer list",
        biomarkers: [
          {
            id: "bio-2",
            code: "ALT",
            display_name: "ALT",
            sort_order: 0,
            biomarker_id: "bio-2",
            created_at: "",
          },
          {
            id: "bio-3",
            code: "AST",
            display_name: "AST",
            sort_order: 1,
            biomarker_id: "bio-3",
            created_at: "",
          },
        ],
        created_at: "",
        updated_at: "2024-01-01T10:00:00Z",
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
      },
    ];

    const push = vi.fn();
    useRouterMock.mockReturnValue(createRouter({ push }));

    const user = userEvent.setup();

    renderWithIntl("en", enMessages);

    const table = await screen.findByRole("table");
    await user.click(
      within(table).getByRole("button", { name: "Actions for Optimizer list" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Load in optimizer" }),
    );

    expect(usePanelStore.getState().selected).toEqual([
      { code: "ALT", name: "ALT" },
      { code: "AST", name: "AST" },
    ]);
    expect(push).toHaveBeenCalledWith("/");
  });
});
