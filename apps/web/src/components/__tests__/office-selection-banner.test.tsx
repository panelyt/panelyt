import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithIntl } from "../../test/utils";
import { DEFAULT_INSTITUTION_ID, useInstitutionStore } from "../../stores/institutionStore";
import { OfficeSelectionBanner } from "../office-selection-banner";

vi.mock("../../hooks/useInstitutionHydrated", () => ({
  useInstitutionHydrated: () => true,
}));

vi.mock("../office-selector", () => ({
  OfficeSelector: () => <div data-testid="office-selector" />,
}));

describe("OfficeSelectionBanner", () => {
  beforeEach(() => {
    useInstitutionStore.setState({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
      hasSelectedInstitution: false,
    });
  });

  it("renders the banner when no office has been selected", () => {
    renderWithIntl(<OfficeSelectionBanner />);

    expect(
      screen.getByText("Choose your office for accurate prices"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("office-selector")).toBeInTheDocument();
  });

  it("hides the banner after an office is selected", () => {
    useInstitutionStore.setState({
      institutionId: 2222,
      label: "Warsaw",
      hasSelectedInstitution: true,
    });

    renderWithIntl(<OfficeSelectionBanner />);

    expect(
      screen.queryByText("Choose your office for accurate prices"),
    ).not.toBeInTheDocument();
  });
});
