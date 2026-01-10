import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { CollectionsToolbar } from "../collections-toolbar";
import type { CollectionsToolbarProps, SortOption } from "../collections-toolbar";
import enMessages from "../../../../i18n/messages/en.json";
import plMessages from "../../../../i18n/messages/pl.json";

const renderToolbar = (
  locale: "en" | "pl",
  messages: typeof enMessages | typeof plMessages,
  overrides: Partial<CollectionsToolbarProps> = {},
) => {
  const props: CollectionsToolbarProps = {
    searchValue: "",
    onSearchChange: vi.fn(),
    sortValue: "updated" as SortOption,
    onSortChange: vi.fn(),
    showInactive: false,
    onShowInactiveChange: vi.fn(),
    isAdmin: true,
    resultCount: 12,
    ...overrides,
  };

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CollectionsToolbar {...props} />
    </NextIntlClientProvider>,
  );
};

describe("CollectionsToolbar", () => {
  it("renders the results count and hides clear filters by default", () => {
    renderToolbar("en", enMessages);

    expect(screen.getByText("12 panels")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: enMessages.collections.clearFilters }),
    ).not.toBeInTheDocument();
  });

  it("does not render the search label above the input", () => {
    renderToolbar("en", enMessages);

    expect(
      screen.queryByText(enMessages.collections.searchLabel),
    ).not.toBeInTheDocument();
  });

  it("does not render clear filters when search is active", () => {
    renderToolbar("en", enMessages, { searchValue: "thyroid" });

    expect(
      screen.queryByRole("button", { name: enMessages.collections.clearFilters }),
    ).not.toBeInTheDocument();
  });

  it("does not render clear filters when inactive templates are shown", () => {
    renderToolbar("en", enMessages, { showInactive: true });

    expect(
      screen.queryByRole("button", { name: enMessages.collections.clearFilters }),
    ).not.toBeInTheDocument();
  });

  it("aligns the sort label and segmented control in a single row", () => {
    renderToolbar("en", enMessages);

    const sortLabel = screen.getByText(enMessages.collections.sortLabel);
    const sortRow = sortLabel.closest("div");

    expect(sortRow).not.toBeNull();
    expect(sortRow).toHaveClass("flex");
    expect(sortRow).toHaveClass("items-center");
    expect(sortRow?.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it("emits sort changes via the segmented control", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderToolbar("en", enMessages, { onSortChange });

    await user.click(
      screen.getByRole("tab", { name: enMessages.collections.sortCount }),
    );

    expect(onSortChange).toHaveBeenCalledWith("count");
  });
});
