import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OfficeSelector } from "../office-selector";

vi.mock("../../hooks/useInstitution", () => ({
  useInstitution: vi.fn(),
}));

vi.mock("../../hooks/useInstitutionHydrated", () => ({
  useInstitutionHydrated: vi.fn(),
}));

vi.mock("../../hooks/useInstitutionSearch", () => ({
  useInstitutionSearch: vi.fn(),
}));

vi.mock("../../hooks/useInstitutionDetails", () => ({
  useInstitutionDetails: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "officeSelector.triggerLabel" && values?.name) {
      return `Office: ${values.name}`;
    }
    if (key === "officeSelector.searchPlaceholder") {
      return "Search offices";
    }
    if (key === "officeSelector.currentLabel" && values?.name) {
      return `Current office: ${values.name}`;
    }
    if (key === "officeSelector.openOnDiag") {
      return "Open on diag.pl";
    }
    if (key === "officeSelector.noResults") {
      return "No offices found";
    }
    if (key === "officeSelector.loading") {
      return "Searching...";
    }
    return key;
  },
}));

import { useInstitution } from "../../hooks/useInstitution";
import { useInstitutionHydrated } from "../../hooks/useInstitutionHydrated";
import { useInstitutionDetails } from "../../hooks/useInstitutionDetails";
import { useInstitutionSearch } from "../../hooks/useInstitutionSearch";

describe("OfficeSelector", () => {
  beforeEach(() => {
    vi.mocked(useInstitutionHydrated).mockReturnValue(true);
  });

  it("uses the institution city when no label is stored", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 213,
      label: null,
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: {
          id: 213,
          name: "Clinic Pulawy",
          city: "Pulawy",
          address: "Main 1",
          slug: null,
          city_slug: null,
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    expect(
      screen.getByRole("button", { name: "Office: Pulawy" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Office: Pulawy" }));

    expect(
      screen.getByText("Current office: Pulawy, Main 1"),
    ).toBeInTheDocument();
  });

  it("does not show the institution id while details are loading", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 213,
      label: null,
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: true,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    expect(
      screen.getByRole("button", { name: "Office: ..." }),
    ).toBeInTheDocument();
    expect(screen.queryByText("#213")).not.toBeInTheDocument();
  });

  it("selects an institution from search results", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 2222,
              name: "Clinic Alpha",
              city: "Warsaw",
              address: "Main 1",
              slug: null,
              city_slug: null,
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "Warsaw" } });

    fireEvent.click(screen.getByRole("option", { name: "Clinic Alpha · Warsaw" }));

    expect(setInstitution).toHaveBeenCalledWith({
      id: 2222,
      label: "Clinic Alpha · Warsaw",
    });
  });

  it("strips the Diagnostyka prefix from office names", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 3333,
              name: "Punkt Pobran Diagnostyki - Puck",
              city: "Gdansk",
              address: "Main 2",
              slug: null,
              city_slug: null,
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "Pu" } });

    fireEvent.click(screen.getByRole("option", { name: "Puck · Gdansk" }));

    expect(setInstitution).toHaveBeenCalledWith({
      id: 3333,
      label: "Puck · Gdansk",
    });
  });

  it("does not select stale results when Enter is pressed with a short query", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 2222,
              name: "Clinic Alpha",
              city: "Warsaw",
              address: "Main 1",
              slug: null,
              city_slug: null,
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "W" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(setInstitution).not.toHaveBeenCalled();
  });

  it("does not render subtitles for search results", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 2222,
              name: "Warsaw, Main 1",
              city: "Warsaw",
              address: "Main 1",
              slug: "warsaw-main-1",
              city_slug: "warszawa",
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "Warsaw" } });

    expect(screen.queryByText("Warsaw · Main 1")).not.toBeInTheDocument();
  });

  it("renders a diag.pl link button for results with slugs", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 2222,
              name: "Clinic Alpha",
              city: "Warsaw",
              address: "Main 1",
              slug: "clinic-alpha",
              city_slug: "warszawa",
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "Warsaw" } });

    const link = screen.getByRole("link", { name: "Open on diag.pl" });
    expect(link).toHaveAttribute(
      "href",
      "https://diag.pl/placowki/warszawa/clinic-alpha/",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("uses pointer cursors for results and the diag link", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
    vi.mocked(useInstitutionDetails).mockReturnValue(
      {
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useInstitutionDetails>,
    );
    vi.mocked(useInstitutionSearch).mockReturnValue(
      {
        data: {
          results: [
            {
              id: 2222,
              name: "Clinic Alpha",
              city: "Warsaw",
              address: "Main 1",
              slug: "clinic-alpha",
              city_slug: "warszawa",
            },
          ],
        },
        isFetching: false,
      } as unknown as ReturnType<typeof useInstitutionSearch>,
    );

    render(<OfficeSelector />);

    fireEvent.click(screen.getByRole("button", { name: "Office: Lab office" }));

    const input = screen.getByPlaceholderText("Search offices");
    fireEvent.change(input, { target: { value: "Warsaw" } });

    expect(
      screen.getByRole("option", { name: "Clinic Alpha · Warsaw" }),
    ).toHaveClass("cursor-pointer");
    expect(screen.getByRole("link", { name: "Open on diag.pl" })).toHaveClass(
      "cursor-pointer",
    );
  });
});
