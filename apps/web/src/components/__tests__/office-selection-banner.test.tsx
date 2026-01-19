import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithIntl } from "../../test/utils";
import { DEFAULT_INSTITUTION_ID, useInstitutionStore } from "../../stores/institutionStore";
import { OfficeSelectionBanner } from "../office-selection-banner";

vi.mock("../../hooks/useUserSession", () => ({
  useUserSession: vi.fn(),
}));

vi.mock("../../hooks/useAccountSettings", () => ({
  useAccountSettings: vi.fn(),
}));

vi.mock("../../hooks/useInstitutionHydrated", () => ({
  useInstitutionHydrated: () => true,
}));

vi.mock("../office-selector", () => ({
  OfficeSelector: () => <div data-testid="office-selector" />,
}));

import { useAccountSettings } from "../../hooks/useAccountSettings";
import { useUserSession } from "../../hooks/useUserSession";

const mockUseUserSession = vi.mocked(useUserSession);
const mockUseAccountSettings = vi.mocked(useAccountSettings);

describe("OfficeSelectionBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSession.mockReturnValue({ data: null, isLoading: false } as any);
    mockUseAccountSettings.mockReturnValue({
      settingsQuery: {
        data: null,
        isLoading: false,
        isFetching: false,
      },
    } as any);
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

  it("does not render while account settings are loading for logged-in users", () => {
    mockUseUserSession.mockReturnValue({
      data: { registered: true, username: "egor" },
      isLoading: false,
    } as any);
    mockUseAccountSettings.mockReturnValue({
      settingsQuery: {
        data: undefined,
        isLoading: true,
        isFetching: true,
      },
    } as any);

    renderWithIntl(<OfficeSelectionBanner />);

    expect(
      screen.queryByText("Choose your office for accurate prices"),
    ).not.toBeInTheDocument();
  });

  it("hides the banner when account settings already have a preferred office", () => {
    mockUseUserSession.mockReturnValue({
      data: { registered: true, username: "egor" },
      isLoading: false,
    } as any);
    mockUseAccountSettings.mockReturnValue({
      settingsQuery: {
        data: { preferred_institution_id: 2222 },
        isLoading: false,
        isFetching: false,
      },
    } as any);

    renderWithIntl(<OfficeSelectionBanner />);

    expect(
      screen.queryByText("Choose your office for accurate prices"),
    ).not.toBeInTheDocument();
  });
});
