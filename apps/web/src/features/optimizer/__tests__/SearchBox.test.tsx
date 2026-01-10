import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, beforeEach, vi } from "vitest";

import enMessages from "@/i18n/messages/en.json";
import { SearchBox } from "../SearchBox";

vi.mock("@/hooks/useCatalogSearch", () => ({
  useCatalogSearch: () => ({
    data: { results: [] },
    isFetching: false,
    error: null,
  }),
}));

describe("SearchBox (optimizer)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders the inline hint in the initial HTML even when dismissed", () => {
    sessionStorage.setItem("panelyt-search-tip-dismissed", "true");

    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SearchBox onSelect={vi.fn()} onTemplateSelect={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(html).toContain(enMessages.home.searchInlineHint);
  });
});
