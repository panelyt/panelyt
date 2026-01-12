import { screen } from "@testing-library/react";
import { vi } from "vitest";

import { PanelActions } from "../panel-actions";
import { renderWithIntl } from "../../test/utils";

const sampleLists = [
  {
    id: "1",
    name: "Metabolic panel",
    biomarkers: [
      {
        id: "entry-1",
        code: "ALT",
        display_name: "Alanine aminotransferase",
        sort_order: 0,
        biomarker_id: null,
        created_at: "",
      },
    ],
    created_at: "",
    updated_at: "",
    share_token: null,
    shared_at: null,
    notify_on_price_drop: false,
    last_known_total_grosz: null,
    last_total_updated_at: null,
    last_notified_total_grosz: null,
    last_notified_at: null,
  },
];

const getButtonName = (button: HTMLElement) => {
  const ariaLabel = button.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  return button.textContent?.replace(/\s+/g, " ").trim() ?? "";
};

describe("PanelActions", () => {
  it("orders the primary actions as more, share, load, save", () => {
    renderWithIntl(
      <PanelActions
        isAdmin
        isPanelHydrated
        selectionCount={1}
        lists={sampleLists}
        isLoadingLists={false}
        onSave={vi.fn()}
        onShare={vi.fn()}
        onLoad={vi.fn()}
        onSaveTemplate={vi.fn()}
        shareButtonContent="Share"
      />,
    );

    const buttons = screen.getAllByRole("button");
    const names = buttons.map(getButtonName);

    expect(names).toEqual(["More", "Share", "Load", "Save"]);
  });

  it("styles save, load, share, and more buttons distinctly", () => {
    renderWithIntl(
      <PanelActions
        isAdmin
        isPanelHydrated
        selectionCount={1}
        lists={sampleLists}
        isLoadingLists={false}
        onSave={vi.fn()}
        onShare={vi.fn()}
        onLoad={vi.fn()}
        onSaveTemplate={vi.fn()}
        shareButtonContent="Share"
      />,
    );

    const saveButton = screen.getByRole("button", { name: /save/i });
    const loadButton = screen.getByRole("button", { name: /load/i });
    const shareButton = screen.getByRole("button", { name: /share/i });
    const moreButton = screen.getByRole("button", { name: /more/i });

    expect(saveButton).toHaveClass("bg-accent-cyan");
    expect(saveButton).not.toHaveClass("bg-emerald-300");

    expect(loadButton).toHaveClass("border-slate-500/70");
    expect(loadButton).toHaveClass("text-slate-200");

    expect(shareButton).toHaveClass("border-transparent");
    expect(shareButton).toHaveClass("text-slate-200");

    expect(moreButton).toHaveClass("rounded-full");
    expect(moreButton.textContent?.trim()).toBe("");
  });
});
