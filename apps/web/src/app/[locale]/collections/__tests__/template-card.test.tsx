import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/utils";
import enMessages from "@/i18n/messages/en.json";
import { TemplateCard } from "../template-card";

const makeTemplate = (overrides: Partial<{
  id: number;
  slug: string;
  name_en: string;
  name_pl: string;
  description_en: string | null;
  description_pl: string | null;
  is_active: boolean;
  updated_at: string;
  biomarkers: Array<{ code: string; display_name: string }>;
}> = {}) => ({
  id: overrides.id ?? 1,
  slug: overrides.slug ?? "template-1",
  name_en: overrides.name_en ?? "Template One",
  name_pl: overrides.name_pl ?? "Szablon Jeden",
  description_en: overrides.description_en ?? "Template description",
  description_pl: overrides.description_pl ?? "Opis szablonu",
  is_active: overrides.is_active ?? true,
  updated_at: overrides.updated_at ?? "2024-01-08T12:00:00Z",
  biomarkers:
    overrides.biomarkers ??
    [
      { code: "ALT", display_name: "ALT" },
      { code: "AST", display_name: "AST" },
    ],
});

describe("TemplateCard", () => {
  it("renders metadata and biomarker chips", () => {
    const template = makeTemplate();

    renderWithIntl(
      <TemplateCard
        template={template}
        pricing={undefined}
        onAddToPanel={vi.fn()}
        onReplacePanel={vi.fn()}
        onViewDetails={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: template.name_en }),
    ).toBeInTheDocument();
    expect(screen.getByText(template.description_en)).toBeInTheDocument();
    expect(screen.getByText("2 tests")).toBeInTheDocument();
    expect(screen.getByText("ALT")).toBeInTheDocument();
  });

  it("shows unpublished badge and updated tooltip", async () => {
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2024-01-10T12:00:00Z").getTime());

    try {
      const template = makeTemplate({ is_active: false });

      renderWithIntl(
        <TemplateCard
          template={template}
          pricing={undefined}
          onAddToPanel={vi.fn()}
          onReplacePanel={vi.fn()}
          onViewDetails={vi.fn()}
        />,
      );

      expect(
        screen.getByText(enMessages.collections.unpublished),
      ).toBeInTheDocument();

      const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      const expectedRelative = relativeFormatter.format(-2, "day");
      const expectedLabel = enMessages.collections.updatedLabel.replace(
        "{date}",
        expectedRelative,
      );

      const updatedLabel = screen.getByText(expectedLabel);
      await userEvent.setup().hover(updatedLabel);

      const expectedExact = new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(template.updated_at));

      await waitFor(() => {
        expect(document.body.textContent).toContain(expectedExact);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("wires apply and view details actions", async () => {
    const user = userEvent.setup();
    const onAddToPanel = vi.fn();
    const onViewDetails = vi.fn();

    renderWithIntl(
      <TemplateCard
        template={makeTemplate()}
        pricing={undefined}
        onAddToPanel={onAddToPanel}
        onReplacePanel={vi.fn()}
        onViewDetails={onViewDetails}
      />,
    );

    await user.click(screen.getByRole("button", { name: enMessages.collections.apply }));
    expect(onAddToPanel).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: enMessages.collections.applyMenu }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: enMessages.collections.viewDetails }),
    );

    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
