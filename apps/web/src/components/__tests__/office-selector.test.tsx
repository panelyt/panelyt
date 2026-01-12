import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OfficeSelector } from "../office-selector";

vi.mock("../../hooks/useInstitution", () => ({
  useInstitution: vi.fn(),
}));

vi.mock("../../hooks/useInstitutionSearch", () => ({
  useInstitutionSearch: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "officeSelector.triggerLabel" && values?.name) {
      return `Office: ${values.name}`;
    }
    if (key === "officeSelector.searchPlaceholder") {
      return "Search offices";
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
import { useInstitutionSearch } from "../../hooks/useInstitutionSearch";

describe("OfficeSelector", () => {
  it("selects an institution from search results", () => {
    const setInstitution = vi.fn();
    vi.mocked(useInstitution).mockReturnValue({
      institutionId: 1135,
      label: "Lab office",
      setInstitution,
    });
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
      } as ReturnType<typeof useInstitutionSearch>,
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
      } as ReturnType<typeof useInstitutionSearch>,
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
});
