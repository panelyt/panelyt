import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { renderWithIntl } from "../../../../../test/utils";
import enMessages from "../../../../../i18n/messages/en.json";
import { track } from "../../../../../lib/analytics";
import { usePanelStore } from "../../../../../stores/panelStore";
import { useTemplateDetail } from "../../../../../hooks/useBiomarkerListTemplates";
import { useOptimization } from "../../../../../hooks/useOptimization";
import { useRouter } from "../../../../../i18n/navigation";
import TemplateDetailContent from "../template-detail-content";

vi.mock("../../../../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

vi.mock("../../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("../../../../../components/optimization-results", () => ({
  OptimizationResults: () => <div data-testid="optimization-results" />,
}));

vi.mock("../../../../../i18n/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("../../../../../hooks/useBiomarkerListTemplates", () => ({
  useTemplateDetail: vi.fn(),
}));

vi.mock("../../../../../hooks/useOptimization", () => ({
  useOptimization: vi.fn(),
}));

const mockUseTemplateDetail = vi.mocked(useTemplateDetail);
const mockUseOptimization = vi.mocked(useOptimization);
const mockUseRouter = vi.mocked(useRouter);
const trackMock = vi.mocked(track);

const templateData = {
  id: 1,
  slug: "heart-template",
  name: "Heart Health",
  description: "Cardio focus",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  biomarkers: [
    {
      id: 1,
      code: "ALT",
      display_name: "ALT",
      sort_order: 0,
      biomarker: null,
      notes: null,
    },
    {
      id: 2,
      code: "AST",
      display_name: "AST",
      sort_order: 1,
      biomarker: null,
      notes: null,
    },
  ],
};

const renderContent = async () => {
  await act(async () => {
    renderWithIntl(
      <>
        <Toaster />
        <TemplateDetailContent params={Promise.resolve({ slug: templateData.slug })} />
      </>,
    );
  });
};

describe("TemplateDetailContent", () => {
  beforeEach(() => {
    usePanelStore.setState({
      selected: [],
      lastOptimizationSummary: undefined,
      lastRemoved: undefined,
    });
    usePanelStore.persist.clearStorage();
    trackMock.mockClear();
    mockUseTemplateDetail.mockReturnValue({
      data: templateData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTemplateDetail>);
    mockUseOptimization.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useOptimization>);
    mockUseRouter.mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useRouter>);
  });

  it("renders add and replace actions near the template metadata", async () => {
    await renderContent();

    expect(
      await screen.findByRole("button", { name: enMessages.collections.addToPanel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enMessages.collections.replacePanel }),
    ).toBeInTheDocument();
  });

  it("adds template biomarkers to the panel and shows a toast with optimizer action", async () => {
    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
      lastOptimizationSummary: undefined,
      lastRemoved: undefined,
    });

    await renderContent();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: enMessages.collections.addToPanel }),
    );

    expect(usePanelStore.getState().selected.map((item) => item.code)).toEqual([
      "ALT",
      "AST",
    ]);

    const appendedToast = enMessages.collections.appliedAppend.replace(
      "{name}",
      templateData.name,
    );
    expect(await screen.findByText(appendedToast)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: enMessages.templateDetail.openOptimizer }),
    ).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("panel_apply_template", { mode: "append" });
  });

  it("replaces the panel with template biomarkers and shows a toast", async () => {
    usePanelStore.setState({
      selected: [{ code: "CRP", name: "CRP" }],
      lastOptimizationSummary: undefined,
      lastRemoved: undefined,
    });

    await renderContent();

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: enMessages.collections.replacePanel }),
    );

    expect(usePanelStore.getState().selected.map((item) => item.code)).toEqual([
      "ALT",
      "AST",
    ]);

    const replacedToast = enMessages.collections.appliedReplace.replace(
      "{name}",
      templateData.name,
    );
    expect(await screen.findByText(replacedToast)).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("panel_apply_template", { mode: "replace" });
  });
});
