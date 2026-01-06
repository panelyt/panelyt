import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CollectionsContent from "../collections-content";
import enMessages from "../../../../i18n/messages/en.json";
import plMessages from "../../../../i18n/messages/pl.json";
import { usePanelStore } from "../../../../stores/panelStore";

vi.mock("../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
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

vi.mock("../../../../hooks/useBiomarkerListTemplates", () => ({
  useTemplateCatalog: () => ({
    data: templatesData,
    isLoading: false,
    isError: false,
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

const renderWithIntl = (
  locale: "en" | "pl",
  messages: typeof enMessages | typeof plMessages,
) =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CollectionsContent />
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

const getTable = () => screen.getByRole("table");

const getTemplateHeadings = () =>
  within(getTable())
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent?.trim());

const getSearchInput = () =>
  screen.getByPlaceholderText(enMessages.collections.searchPlaceholder);

const getSortSelect = () =>
  screen.getByLabelText(enMessages.collections.sortLabel);

describe("CollectionsContent", () => {
  beforeEach(() => {
    sessionData = { is_admin: false };
    templatesData = [];
    pricingBySlug = {};
    updateMutation.mutateAsync.mockClear();
    deleteMutation.mutateAsync.mockClear();
    usePanelStore.setState({ selected: [] });
  });

  it("hides inactive templates for non-admin users", () => {
    templatesData = [
      makeTemplate({ id: 1, name: "Active Template", is_active: true }),
      makeTemplate({ id: 2, name: "Hidden Template", is_active: false }),
    ];

    renderWithIntl("en", enMessages);

    const table = getTable();
    expect(within(table).getByText("Active Template")).toBeInTheDocument();
    expect(within(table).queryByText("Hidden Template")).not.toBeInTheDocument();
  });

  it("filters templates by search term across name and description", async () => {
    templatesData = [
      makeTemplate({ id: 3, name: "Heart Health", description: "Cholesterol" }),
      makeTemplate({ id: 4, name: "Thyroid Panel", description: "Hormone focus" }),
    ];

    renderWithIntl("en", enMessages);

    const user = userEvent.setup();
    await user.type(getSearchInput(), "thyroid");

    const table = getTable();
    expect(within(table).getByText("Thyroid Panel")).toBeInTheDocument();
    expect(within(table).queryByText("Heart Health")).not.toBeInTheDocument();
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
    await user.selectOptions(getSortSelect(), "count");

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
    await user.selectOptions(getSortSelect(), "total");

    const headings = getTemplateHeadings();
    expect(headings[0]).toBe("Beta");
    expect(headings[1]).toBe("Alpha");
  });

  it("renders the table layout with key columns", () => {
    templatesData = [makeTemplate({ id: 11, name: "Baseline" })];

    renderWithIntl("en", enMessages);

    const table = getTable();
    const header = within(table).getAllByRole("columnheader");
    expect(header.length).toBeGreaterThan(0);
    expect(within(table).getByText(enMessages.collections.columnName)).toBeInTheDocument();
    expect(within(table).getByText(enMessages.collections.columnUpdated)).toBeInTheDocument();
    expect(within(table).getByText(enMessages.collections.columnBiomarkers)).toBeInTheDocument();
    expect(within(table).getByText(enMessages.collections.columnTotal)).toBeInTheDocument();
  });

  it("reveals a biomarker preview and overflow count when expanded", async () => {
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
    const table = getTable();
    await user.click(
      within(table).getByRole("button", { name: enMessages.collections.expandRow }),
    );

    const details = document.getElementById("template-extended-details");
    expect(details).not.toBeNull();
    if (!details) return;

    expect(within(details).getByText("Biomarker 1")).toBeInTheDocument();
    expect(within(details).getByText("Biomarker 10")).toBeInTheDocument();
    expect(within(details).queryByText("Biomarker 11")).not.toBeInTheDocument();
    expect(
      within(details).getByText(
        enMessages.collections.moreBiomarkers.replace("{count}", "2"),
      ),
    ).toBeInTheDocument();
  });

  it("appends biomarkers to the panel from the expanded actions", async () => {
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
    const table = getTable();
    await user.click(
      within(table).getByRole("button", { name: enMessages.collections.expandRow }),
    );

    const details = document.getElementById("template-append-details");
    expect(details).not.toBeNull();
    if (!details) return;

    await user.click(
      within(details).getByRole("button", { name: enMessages.collections.addToPanel }),
    );

    expect(usePanelStore.getState().selected.map((item) => item.code)).toEqual(["ALT"]);
  });

  it("replaces the panel selection from the expanded actions", async () => {
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
    const table = getTable();
    await user.click(
      within(table).getByRole("button", { name: enMessages.collections.expandRow }),
    );

    const details = document.getElementById("template-replace-details");
    expect(details).not.toBeNull();
    if (!details) return;

    await user.click(
      within(details).getByRole("button", { name: enMessages.collections.replacePanel }),
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
    const table = getTable();
    await user.click(
      within(table).getByRole("button", { name: enMessages.collections.adminMenu }),
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
    const table = getTable();
    await user.click(
      within(table).getByRole("button", { name: enMessages.collections.adminMenu }),
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
});
