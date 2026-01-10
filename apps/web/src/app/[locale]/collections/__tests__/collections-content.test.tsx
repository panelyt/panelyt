import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";

import CollectionsContent from "../collections-content";
import enMessages from "../../../../i18n/messages/en.json";
import plMessages from "../../../../i18n/messages/pl.json";
import { usePanelStore } from "../../../../stores/panelStore";
import { track } from "../../../../lib/analytics";

vi.mock("../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

const pushMock = vi.fn();

vi.mock("../../../../i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  getPathname: ({ href, locale }: { href: string; locale?: string }) =>
    locale ? `/${locale}${href}` : href,
  useRouter: vi.fn(() => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

let sessionData: { is_admin?: boolean } | null = null;

vi.mock("../../../../hooks/useUserSession", () => ({
  useUserSession: () => ({ data: sessionData, isLoading: false }),
}));

let templatesData: Array<{
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  biomarkers: Array<{
    id: number;
    code: string;
    display_name: string;
    sort_order: number;
    biomarker: null;
    notes: string | null;
  }>;
}> = [];

let pricingBySlug: Record<
  string,
  { status: "loading" | "error" | "success"; totalNow?: number }
> = {};
let templatesLoading = false;
let templatesError = false;

vi.mock("../../../../hooks/useBiomarkerListTemplates", () => ({
  useTemplateCatalog: () => ({
    data: templatesData,
    isLoading: templatesLoading,
    isError: templatesError,
  }),
  useTemplatePricing: () => ({ pricingBySlug }),
}));

const updateMutation = { mutateAsync: vi.fn() };
const deleteMutation = { mutateAsync: vi.fn() };

vi.mock("../../../../hooks/useTemplateAdmin", () => ({
  useTemplateAdmin: () => ({
    updateMutation,
    deleteMutation,
  }),
}));

vi.mock("../../../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

const trackMock = vi.mocked(track);

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
          <CollectionsContent />
        </>
      ) : (
        <CollectionsContent />
      )}
    </NextIntlClientProvider>,
  );

const makeTemplate = (
  overrides: Partial<(typeof templatesData)[number]> = {},
): (typeof templatesData)[number] => ({
  id: overrides.id ?? 1,
  slug: overrides.slug ?? "template-1",
  name: overrides.name ?? "Template One",
  description: overrides.description ?? "",
  is_active: overrides.is_active ?? true,
  created_at: overrides.created_at ?? "2024-01-01T00:00:00Z",
  updated_at: overrides.updated_at ?? "2024-01-05T00:00:00Z",
  biomarkers:
    overrides.biomarkers ??
    [
      {
        id: 1,
        code: "ALT",
        display_name: "ALT",
        sort_order: 0,
        biomarker: null,
        notes: null,
      },
    ],
});

const setMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const getTemplateHeadings = () =>
  screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent?.trim());

const getSearchInput = () =>
  screen.getByPlaceholderText(enMessages.collections.searchPlaceholder);

const getSortOption = (label: string) =>
  screen.getByRole("tab", { name: label });

describe("CollectionsContent", () => {
  beforeEach(() => {
    sessionData = { is_admin: false };
    templatesData = [];
    pricingBySlug = {};
    templatesLoading = false;
    templatesError = false;
    updateMutation.mutateAsync.mockClear();
    deleteMutation.mutateAsync.mockClear();
    usePanelStore.setState({ selected: [] });
    trackMock.mockClear();
    pushMock.mockClear();
  });

  it("shows skeleton cards while templates are loading", () => {
    templatesLoading = true;

    renderWithIntl("en", enMessages);

    expect(screen.getAllByTestId("template-card-skeleton")).toHaveLength(6);
    expect(
      screen.queryByText(enMessages.collections.loadingTemplates),
    ).not.toBeInTheDocument();
  });

  it("shows the empty catalog message when no templates exist", () => {
    templatesData = [];

    renderWithIntl("en", enMessages);

    const emptyState = screen.getByTestId("collections-empty-catalog");
    expect(within(emptyState).getByText(enMessages.collections.noTemplates)).toBeInTheDocument();
    expect(
      within(emptyState).queryByRole("button", {
        name: enMessages.collections.clearFilters,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a no results state with clear filters when filters hide all templates", async () => {
    templatesData = [makeTemplate({ id: 20, name: "Visible Template" })];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.type(getSearchInput(), "missing");

    const emptyState = screen.getByTestId("collections-empty-results");
    expect(within(emptyState).getByText(enMessages.collections.noResults)).toBeInTheDocument();

    const clearButton = within(emptyState).getByRole("button", {
      name: enMessages.collections.clearFilters,
    });
    await user.click(clearButton);

    expect(screen.getByText("Visible Template")).toBeInTheDocument();
  });

  it("hides inactive templates for non-admin users", () => {
    templatesData = [
      makeTemplate({ id: 1, name: "Active Template", is_active: true }),
      makeTemplate({ id: 2, name: "Hidden Template", is_active: false }),
    ];

    renderWithIntl("en", enMessages);

    expect(screen.getByText("Active Template")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Template")).not.toBeInTheDocument();
  });

  it("filters templates by search term across name and description", async () => {
    templatesData = [
      makeTemplate({ id: 3, name: "Heart Health", description: "Cholesterol" }),
      makeTemplate({ id: 4, name: "Thyroid Panel", description: "Hormone focus" }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.type(getSearchInput(), "thyroid");

    expect(screen.getByText("Thyroid Panel")).toBeInTheDocument();
    expect(screen.queryByText("Heart Health")).not.toBeInTheDocument();
  });

  it("defaults to sorting by most recently updated", () => {
    templatesData = [
      makeTemplate({ id: 5, name: "Older", updated_at: "2024-01-01T00:00:00Z" }),
      makeTemplate({ id: 6, name: "Newer", updated_at: "2024-02-01T00:00:00Z" }),
    ];

    renderWithIntl("en", enMessages);

    const headings = getTemplateHeadings();
    expect(headings[0]).toBe("Newer");
    expect(headings[1]).toBe("Older");
  });

  it("sorts templates by biomarker count when selected", async () => {
    templatesData = [
      makeTemplate({
        id: 7,
        name: "Small",
        biomarkers: [
          {
            id: 1,
            code: "ALT",
            display_name: "ALT",
            sort_order: 0,
            biomarker: null,
            notes: null,
          },
        ],
      }),
      makeTemplate({
        id: 8,
        name: "Large",
        biomarkers: [
          {
            id: 2,
            code: "AST",
            display_name: "AST",
            sort_order: 0,
            biomarker: null,
            notes: null,
          },
          {
            id: 3,
            code: "B12",
            display_name: "B12",
            sort_order: 1,
            biomarker: null,
            notes: null,
          },
        ],
      }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(getSortOption(enMessages.collections.sortCount));

    const headings = getTemplateHeadings();
    expect(headings[0]).toBe("Large");
    expect(headings[1]).toBe("Small");
  });

  it("sorts templates by current total when selected", async () => {
    templatesData = [
      makeTemplate({ id: 9, slug: "alpha", name: "Alpha" }),
      makeTemplate({ id: 10, slug: "beta", name: "Beta" }),
    ];
    pricingBySlug = {
      alpha: { status: "success", totalNow: 240 },
      beta: { status: "success", totalNow: 120 },
    };

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(getSortOption(enMessages.collections.sortTotal));

    const headings = getTemplateHeadings();
    expect(headings[0]).toBe("Beta");
    expect(headings[1]).toBe("Alpha");
  });

  it("renders a card list with metadata and no table", () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2024-01-10T12:00:00Z").getTime());

    try {
      const descriptionText = "Baseline description";
      templatesData = [
        makeTemplate({
          id: 11,
          name: "Baseline",
          description: descriptionText,
          updated_at: "2024-01-08T12:00:00Z",
        }),
      ];

      renderWithIntl("en", enMessages);

      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      const expectedRelative = relativeFormatter.format(-2, "day");
      const expectedUpdatedLabel = enMessages.collections.updatedLabel.replace(
        "{date}",
        expectedRelative,
      );

      expect(screen.getByText(expectedUpdatedLabel)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Baseline" })).toBeInTheDocument();
      expect(screen.getByText("1 biomarker")).toBeInTheDocument();

      const description = screen.getByText(descriptionText);
      expect(description).toHaveClass("line-clamp-2");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows updated timestamps as relative time with an exact tooltip", async () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2024-01-10T12:00:00Z").getTime());

    try {
      templatesData = [
        makeTemplate({
          id: 19,
          name: "Relative Time",
          updated_at: "2024-01-08T12:00:00Z",
        }),
      ];

      renderWithIntl("en", enMessages);

      const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      const expectedRelative = relativeFormatter.format(-2, "day");
      const expectedLabel = enMessages.collections.updatedLabel.replace(
        "{date}",
        expectedRelative,
      );
      const expectedExact = new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date("2024-01-08T12:00:00Z"));

      const user = userEvent.setup();
      const relativeText = screen.getByText(expectedLabel);
      expect(relativeText).toBeInTheDocument();

      await user.hover(relativeText);

      await waitFor(() => {
        expect(document.body.textContent).toContain(expectedExact);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows all biomarkers when expanded", async () => {
    setMatchMedia(false);
    templatesData = [
      makeTemplate({
        id: 12,
        name: "Extended",
        slug: "extended",
        biomarkers: Array.from({ length: 12 }, (_, index) => ({
          id: index + 1,
          code: `B${index + 1}`,
          display_name: `Biomarker ${index + 1}`,
          sort_order: index,
          biomarker: null,
          notes: null,
        })),
      }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();

    const expandLabel = enMessages.collections.moreBiomarkers.replace("{count}", "8");
    expect(screen.queryByText("Biomarker 12")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: expandLabel }));

    expect(screen.getByText("Biomarker 1")).toBeInTheDocument();
    expect(screen.getByText("Biomarker 10")).toBeInTheDocument();
    expect(screen.getByText("Biomarker 11")).toBeInTheDocument();
    expect(screen.getByText("Biomarker 12")).toBeInTheDocument();
  });

  it("appends biomarkers to the panel from the apply action", async () => {
    templatesData = [
      makeTemplate({
        id: 13,
        name: "Append Set",
        slug: "append",
        biomarkers: [
          {
            id: 1,
            code: "ALT",
            display_name: "ALT",
            sort_order: 0,
            biomarker: null,
            notes: null,
          },
        ],
      }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.apply }),
    );

    expect(usePanelStore.getState().selected.map((item) => item.code)).toEqual(["ALT"]);
  });

  it("replaces the panel selection from the apply menu", async () => {
    templatesData = [
      makeTemplate({
        id: 14,
        name: "Replace Set",
        slug: "replace",
        biomarkers: [
          {
            id: 1,
            code: "AST",
            display_name: "AST",
            sort_order: 0,
            biomarker: null,
            notes: null,
          },
        ],
      }),
    ];

    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
    });

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.replacePanel }),
    );

    expect(usePanelStore.getState().selected.map((item) => item.code)).toEqual(["AST"]);
  });

  it("opens the edit dialog from the admin menu", async () => {
    sessionData = { is_admin: true };
    templatesData = [
      makeTemplate({ id: 15, name: "Admin Template", slug: "admin-template" }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    );
    await user.click(screen.getByRole("menuitem", { name: enMessages.common.edit }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(enMessages.templateModal.editTemplate)).toBeInTheDocument();
  });

  it("confirms deletions via a dialog before calling the delete mutation", async () => {
    sessionData = { is_admin: true };
    templatesData = [
      makeTemplate({ id: 16, name: "Delete Me", slug: "delete-me" }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    );
    await user.click(screen.getByRole("menuitem", { name: enMessages.common.delete }));

    const confirmText = enMessages.templateModal.deleteConfirm.replace(
      "{name}",
      "Delete Me",
    );
    expect(screen.getByText(confirmText)).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: enMessages.common.delete }),
    );

    expect(deleteMutation.mutateAsync).toHaveBeenCalledWith("delete-me");
  });

  it("tracks and toasts when templates are appended to the panel", async () => {
    templatesData = [
      makeTemplate({ id: 17, name: "Appendable", slug: "appendable" }),
    ];

    renderWithIntl("en", enMessages, true);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.apply }),
    );

    const toastMessage = enMessages.collections.appliedAppend.replace(
      "{name}",
      "Appendable",
    );
    expect(await screen.findByText(toastMessage)).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("panel_apply_template", { mode: "append" });
  });

  it("tracks and toasts when templates replace the panel selection", async () => {
    templatesData = [
      makeTemplate({ id: 18, name: "Replacement", slug: "replacement" }),
    ];

    renderWithIntl("en", enMessages, true);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.replacePanel }),
    );

    const toastMessage = enMessages.collections.appliedReplace.replace(
      "{name}",
      "Replacement",
    );
    expect(await screen.findByText(toastMessage)).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("panel_apply_template", { mode: "replace" });
  });
});
