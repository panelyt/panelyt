import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/utils";
import enMessages from "@/i18n/messages/en.json";
import { TemplateBiomarkerChips } from "../template-biomarker-chips";

const setMatchMedia = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const makeBiomarkers = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    code: `B${index + 1}`,
    display_name: `Biomarker ${index + 1}`,
  }));

describe("TemplateBiomarkerChips", () => {
  it("shows 6 biomarkers on desktop with a +X more chip", () => {
    setMatchMedia(true);

    renderWithIntl(
      <TemplateBiomarkerChips biomarkers={makeBiomarkers(8)} />,
    );

    expect(screen.getByText("Biomarker 1")).toBeInTheDocument();
    expect(screen.getByText("Biomarker 6")).toBeInTheDocument();
    expect(screen.queryByText("Biomarker 7")).not.toBeInTheDocument();
    expect(screen.queryByText("Biomarker 8")).not.toBeInTheDocument();

    const label = enMessages.collections.moreBiomarkers.replace("{count}", "2");
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("shows 4 biomarkers on mobile with a +X more chip", () => {
    setMatchMedia(false);

    renderWithIntl(
      <TemplateBiomarkerChips biomarkers={makeBiomarkers(5)} />,
    );

    expect(screen.getByText("Biomarker 1")).toBeInTheDocument();
    expect(screen.getByText("Biomarker 4")).toBeInTheDocument();
    expect(screen.queryByText("Biomarker 5")).not.toBeInTheDocument();

    const label = enMessages.collections.moreBiomarkers.replace("{count}", "1");
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });

  it("expands and collapses the chip list", async () => {
    setMatchMedia(false);

    renderWithIntl(
      <TemplateBiomarkerChips biomarkers={makeBiomarkers(7)} />,
    );

    const user = userEvent.setup();
    const expandLabel = enMessages.collections.moreBiomarkers.replace("{count}", "3");

    const expandButton = screen.getByRole("button", { name: expandLabel });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");

    await user.click(expandButton);

    expect(screen.getByText("Biomarker 7")).toBeInTheDocument();
    const collapseButton = screen.getByRole("button", {
      name: enMessages.collections.collapseChips,
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseButton);

    expect(screen.queryByText("Biomarker 7")).not.toBeInTheDocument();
  });
});
