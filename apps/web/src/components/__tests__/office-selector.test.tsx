import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OfficeSelector } from "../office-selector";

vi.mock("../../hooks/useInstitution", () => ({
  useInstitution: vi.fn(),
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
import { useInstitutionDetails } from "../../hooks/useInstitutionDetails";
import { useInstitutionSearch } from "../../hooks/useInstitutionSearch";

describe("OfficeSelector", () => {
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
});
