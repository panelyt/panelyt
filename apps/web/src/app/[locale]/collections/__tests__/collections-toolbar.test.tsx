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
    onClearFilters: vi.fn(),
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

    expect(screen.getByText("12 templates")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: enMessages.collections.clearFilters }),
    ).not.toBeInTheDocument();
  });

  it("shows clear filters when search is active", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    renderToolbar("en", enMessages, { searchValue: "thyroid", onClearFilters });

    const clearButton = screen.getByRole("button", {
      name: enMessages.collections.clearFilters,
    });
    expect(clearButton).toHaveClass("h-10");
    await user.click(clearButton);

    expect(onClearFilters).toHaveBeenCalled();
  });

  it("shows clear filters when inactive templates are shown", () => {
    renderToolbar("en", enMessages, { showInactive: true });

    expect(
      screen.getByRole("button", { name: enMessages.collections.clearFilters }),
    ).toBeInTheDocument();
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
