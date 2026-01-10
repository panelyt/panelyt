import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/format";
import enMessages from "@/i18n/messages/en.json";
import { renderWithIntl } from "@/test/utils";

import { TemplatePriceSummary } from "../template-price-summary";

describe("TemplatePriceSummary", () => {
  it("shows amount without a current total label when pricing succeeds", () => {
    renderWithIntl(
      <TemplatePriceSummary pricing={{ status: "success", totalNow: 123.45 }} />,
    );

    expect(
      screen.queryByText(enMessages.collections.currentTotalLabel),
    ).not.toBeInTheDocument();
    const formatted = formatCurrency(123.45);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" && element.textContent === formatted,
      ),
    ).toBeInTheDocument();
  });

  it("uses neutral not available label when total is missing", () => {
    renderWithIntl(<TemplatePriceSummary pricing={{ status: "success" }} />);

    expect(screen.getByText(enMessages.common.notAvailable)).toBeInTheDocument();
    expect(
      screen.queryByText(enMessages.collections.pricingUnavailable),
    ).not.toBeInTheDocument();
  });
});
