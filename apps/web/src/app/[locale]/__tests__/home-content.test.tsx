import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";
import type { OptimizeResponse } from "@panelyt/types";

import { renderWithIntl } from "../../../test/utils";
import enMessages from "../../../i18n/messages/en.json";

vi.mock("../../../lib/analytics", () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}));

vi.mock("../../../hooks/useUserSession", () => ({
  useUserSession: vi.fn(),
}));

vi.mock("../../../hooks/useSavedLists", () => ({
  useSavedLists: vi.fn(),
}));

vi.mock("../../../hooks/useOptimization", () => ({
  useOptimization: vi.fn(),
  useAddonSuggestions: vi.fn(),
}));

vi.mock("../../../hooks/useBiomarkerSelection", () => ({
  useBiomarkerSelection: vi.fn(),
}));

vi.mock("../../../hooks/useUrlParamSync", () => ({
  useUrlParamSync: vi.fn(),
}));

vi.mock("../../../hooks/useUrlBiomarkerSync", () => ({
  useUrlBiomarkerSync: vi.fn(),
}));

vi.mock("../../../hooks/useSaveListModal", () => ({
  useSaveListModal: vi.fn(),
}));

vi.mock("../../../hooks/useTemplateModal", () => ({
  useTemplateModal: vi.fn(),
}));

vi.mock("../../../hooks/useBiomarkerPrices", () => ({
  useBiomarkerPrices: vi.fn(),
}));

vi.mock("../../../components/header", () => ({
  Header: ({ onAuthSuccess }: { onAuthSuccess?: () => void }) => (
    <button type="button" data-testid="header-auth" onClick={onAuthSuccess}>
      Header
    </button>
  ),
}));

vi.mock("../../../components/office-selection-banner", () => ({
  OfficeSelectionBanner: () => <div data-testid="office-selection-banner" />,
}));

vi.mock("../../../components/search-box", () => ({
  SearchBox: () => <div data-testid="search-box" />,
}));

vi.mock("../../../components/selected-biomarkers", () => ({
  SelectedBiomarkers: () => <div data-testid="selected-biomarkers" />,
}));

vi.mock("../../../components/optimization-results", () => ({
  OptimizationResults: () => <div data-testid="optimization-results" />,
}));

vi.mock("../../../components/save-list-modal", () => ({
  SaveListModal: () => <div data-testid="save-list-modal" />,
}));

vi.mock("../../../components/template-modal", () => ({
  TemplateModal: () => <div data-testid="template-modal" />,
}));


import { useUserSession } from "../../../hooks/useUserSession";
import { useSavedLists } from "../../../hooks/useSavedLists";
import { useOptimization, useAddonSuggestions } from "../../../hooks/useOptimization";
import { useBiomarkerSelection } from "../../../hooks/useBiomarkerSelection";
import { useUrlParamSync } from "../../../hooks/useUrlParamSync";
import { useUrlBiomarkerSync } from "../../../hooks/useUrlBiomarkerSync";
import { useSaveListModal } from "../../../hooks/useSaveListModal";
import { useTemplateModal } from "../../../hooks/useTemplateModal";
import { useBiomarkerPrices } from "../../../hooks/useBiomarkerPrices";
import { track } from "../../../lib/analytics";
import { usePanelStore } from "../../../stores/panelStore";
import Home from "../home-content";

const mockUseUserSession = vi.mocked(useUserSession);
const mockUseSavedLists = vi.mocked(useSavedLists);
const mockUseOptimization = vi.mocked(useOptimization);
const mockUseAddonSuggestions = vi.mocked(useAddonSuggestions);
const mockUseBiomarkerSelection = vi.mocked(useBiomarkerSelection);
const mockUseUrlParamSync = vi.mocked(useUrlParamSync);
const mockUseUrlBiomarkerSync = vi.mocked(useUrlBiomarkerSync);
const mockUseSaveListModal = vi.mocked(useSaveListModal);
const mockUseTemplateModal = vi.mocked(useTemplateModal);
const mockUseBiomarkerPrices = vi.mocked(useBiomarkerPrices);
const trackMock = vi.mocked(track);

const selectionStub = {
  selected: [{ code: "ALT", name: "Alanine aminotransferase" }],
  biomarkerCodes: ["ALT"],
  selectionPayload: [{ code: "ALT", name: "Alanine aminotransferase" }],
  error: null,
  handleSelect: vi.fn(),
  handleRemove: vi.fn(),
  clearAll: vi.fn(),
  handleTemplateSelect: vi.fn(),
  handleApplyAddon: vi.fn(),
  handleLoadList: vi.fn(),
  replaceAll: vi.fn(),
  setSelected: vi.fn(),
  setError: vi.fn(),
  clearError: vi.fn(),
};

const saveListModalStub = {
  isOpen: false,
  name: "",
  error: null,
  isSaving: false,
  setName: vi.fn(),
  close: vi.fn(),
  handleConfirm: vi.fn(),
  open: vi.fn(),
};

const templateModalStub = {
  isOpen: false,
  name: "",
  slug: "",
  description: "",
  isActive: false,
  error: null,
  isSaving: false,
  setName: vi.fn(),
  setSlug: vi.fn(),
  setDescription: vi.fn(),
  setIsActive: vi.fn(),
  close: vi.fn(),
  handleConfirm: vi.fn(),
  open: vi.fn(),
};

describe("HomeContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackMock.mockClear();
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined, lastRemoved: undefined });

    mockUseUserSession.mockReturnValue({
      data: { is_admin: false, registered: true, username: "User" },
      isLoading: false,
    } as ReturnType<typeof useUserSession>);

    mockUseSavedLists.mockReturnValue(
      {
        listsQuery: { data: [], isFetching: false },
      } as unknown as ReturnType<typeof useSavedLists>,
    );

    mockUseOptimization.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      optimizationKey: "",
      debouncedBiomarkers: [],
    } as unknown as ReturnType<typeof useOptimization>);
    mockUseAddonSuggestions.mockReturnValue({
      data: { addon_suggestions: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useAddonSuggestions>);

    mockUseBiomarkerSelection.mockReturnValue(
      selectionStub as ReturnType<typeof useBiomarkerSelection>,
    );

    mockUseUrlParamSync.mockImplementation(() => undefined);

    mockUseUrlBiomarkerSync.mockReturnValue({
      isLoadingFromUrl: false,
      getShareUrl: vi.fn(() => ""),
      copyShareUrl: vi.fn(),
    } as ReturnType<typeof useUrlBiomarkerSync>);

    mockUseSaveListModal.mockReturnValue(
      saveListModalStub as ReturnType<typeof useSaveListModal>,
    );

    mockUseTemplateModal.mockReturnValue(
      templateModalStub as ReturnType<typeof useTemplateModal>,
    );

    mockUseBiomarkerPrices.mockReturnValue({
      data: { ALT: 14_000 },
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useBiomarkerPrices>);
  });

  it("renders the two-rail layout with a sticky summary bar when selection exists", () => {
    renderWithIntl(<Home />);

    const layout = screen.getByTestId("optimizer-layout");
    const rightRail = layout.querySelector('[data-slot="right"]');

    expect(layout).toBeInTheDocument();
    expect(screen.getByTestId("sticky-summary-bar")).toBeInTheDocument();
    expect(rightRail).toContainElement(screen.getByTestId("optimization-results"));
  });

  it("orders sticky summary actions as share then save", () => {
    renderWithIntl(<Home />);

    const bar = screen.getByTestId("sticky-summary-bar");
    const summary = within(bar);
    const shareButton = summary.getByRole("button", { name: /share/i });
    const saveButton = summary.getByRole("button", {
      name: enMessages.common.savePanel,
    });

    expect(
      shareButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows a toast when the share link is copied", async () => {
    const copyShareUrl = vi.fn().mockResolvedValue(true);
    mockUseUrlBiomarkerSync.mockReturnValue({
      isLoadingFromUrl: false,
      getShareUrl: vi.fn(() => ""),
      copyShareUrl,
    } as ReturnType<typeof useUrlBiomarkerSync>);

    const user = userEvent.setup();

    renderWithIntl(
      <>
        <Toaster />
        <Home />
      </>,
    );

    const bar = screen.getByTestId("sticky-summary-bar");
    await user.click(within(bar).getByRole("button", { name: /share/i }));

    expect(copyShareUrl).toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith("share_copy_url", { status: "success" });
    expect(await screen.findByText("Share link copied.")).toBeInTheDocument();
  });

  it("shows copied feedback on the share button after a successful copy", async () => {
    const copyShareUrl = vi.fn().mockResolvedValue(true);
    mockUseUrlBiomarkerSync.mockReturnValue({
      isLoadingFromUrl: false,
      getShareUrl: vi.fn(() => ""),
      copyShareUrl,
    } as ReturnType<typeof useUrlBiomarkerSync>);

    const user = userEvent.setup();

    renderWithIntl(<Home />);

    const bar = screen.getByTestId("sticky-summary-bar");
    await user.click(within(bar).getByRole("button", { name: /share/i }));

    expect(await within(bar).findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("renders optimization summary values when data is available", () => {
    const activeResult: OptimizeResponse = {
      total_now: 120,
      total_min30: 110,
      currency: "PLN",
      items: [],
      bonus_total_now: 0,
      explain: {},
      uncovered: [],
      labels: {},
      addon_suggestions: [],
    };

    mockUseOptimization.mockReturnValueOnce({
      data: activeResult,
      isLoading: false,
      error: null,
      optimizationKey: "alt",
      debouncedBiomarkers: ["ALT"],
    } as unknown as ReturnType<typeof useOptimization>);

    renderWithIntl(<Home />);

    const bar = screen.getByTestId("sticky-summary-bar");
    const summary = within(bar);

    expect(summary.getByText("Source")).toBeInTheDocument();
    expect(summary.getByText("Diagnostyka")).toBeInTheDocument();
    const totalStat = summary.getByText("Estimated price").closest("div") as HTMLElement;
    const savingsStat = summary.getByText("Potential savings").closest("div") as HTMLElement;

    expect(totalStat).toHaveTextContent(/120,00/);
    expect(savingsStat).toHaveTextContent(/20,00/);
  });

  it("shows blurred summary placeholders when selection changes", () => {
    const activeResult: OptimizeResponse = {
      total_now: 120,
      total_min30: 100,
      currency: "PLN",
      items: [],
      bonus_total_now: 0,
      explain: {},
      uncovered: [],
      labels: {},
      addon_suggestions: [],
    };

    mockUseOptimization.mockReturnValueOnce({
      data: activeResult,
      isLoading: false,
      error: null,
      optimizationKey: "b12",
      debouncedBiomarkers: ["B12"],
    } as unknown as ReturnType<typeof useOptimization>);

    renderWithIntl(<Home />);

    const bar = screen.getByTestId("sticky-summary-bar");
    const summary = within(bar);

    expect(summary.getByText("Source")).toBeInTheDocument();
    expect(summary.getByText("Estimated price")).toBeInTheDocument();
    expect(summary.getByText("Potential savings")).toBeInTheDocument();

    const totalStat = summary.getByText("Estimated price").closest("div") as HTMLElement;
    const savingsStat = summary.getByText("Potential savings").closest("div") as HTMLElement;
    const totalValue = totalStat.querySelector('[data-slot="value"]') as HTMLElement;
    const savingsValue = savingsStat.querySelector('[data-slot="value"]') as HTMLElement;

    expect(totalValue).toHaveAttribute("data-state", "loading");
    expect(totalValue).toHaveClass("blur-sm");
    expect(savingsValue).toHaveAttribute("data-state", "loading");
    expect(savingsValue).toHaveClass("blur-sm");
  });

  it("stores the optimization summary in the panel store when results load", () => {
    const activeResult: OptimizeResponse = {
      total_now: 180,
      total_min30: 150,
      currency: "PLN",
      items: [],
      bonus_total_now: 0,
      explain: {},
      uncovered: ["b12"],
      labels: {},
      addon_suggestions: [],
    };

    mockUseOptimization.mockReturnValueOnce({
      data: activeResult,
      isLoading: false,
      error: null,
      optimizationKey: "b12",
      debouncedBiomarkers: ["B12"],
    } as unknown as ReturnType<typeof useOptimization>);

    mockUseBiomarkerSelection.mockReturnValueOnce({
      ...selectionStub,
      selected: [{ code: "B12", name: "Vitamin B12" }],
      biomarkerCodes: ["B12"],
    } as ReturnType<typeof useBiomarkerSelection>);

    renderWithIntl(<Home />);

    expect(usePanelStore.getState().lastOptimizationSummary).toEqual({
      key: "b12",
      totalNow: 180,
      totalMin30: 150,
      uncoveredCount: 1,
      updatedAt: expect.any(String),
    });
  });

  it("does not clear selection on auth success", async () => {
    const user = userEvent.setup();

    renderWithIntl(<Home />);

    await user.click(screen.getByTestId("header-auth"));

    expect(selectionStub.replaceAll).not.toHaveBeenCalled();
  });

  it("prioritizes save/share actions and tucks template behind more menu", async () => {
    const user = userEvent.setup();
    const list = {
      id: "1",
      name: "Metabolic panel",
      created_at: "",
      updated_at: "",
      share_token: null,
      shared_at: null,
      notify_on_price_drop: false,
      last_known_total_grosz: null,
      last_total_updated_at: null,
      last_notified_total_grosz: null,
      last_notified_at: null,
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
    };

    mockUseUserSession.mockReturnValueOnce({
      data: { is_admin: true, registered: true, username: "User" },
      isLoading: false,
    } as ReturnType<typeof useUserSession>);

    mockUseSavedLists.mockReturnValueOnce(
      {
        listsQuery: { data: [list], isFetching: false },
      } as unknown as ReturnType<typeof useSavedLists>,
    );

    renderWithIntl(<Home />);

    const layout = screen.getByTestId("optimizer-layout");
    const leftRail = layout.querySelector('[data-slot="left"]') as HTMLElement;
    const leftActions = within(leftRail);

    const saveButton = leftActions.getByRole("button", {
      name: enMessages.common.savePanel,
    });
    const shareButton = leftActions.getByRole("button", { name: enMessages.common.share });
    const loadButton = leftActions.getByRole("button", {
      name: enMessages.common.loadPanel,
    });
    const moreButton = leftActions.getByRole("button", { name: enMessages.common.more });

    expect(
      moreButton.compareDocumentPosition(shareButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      shareButton.compareDocumentPosition(loadButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      loadButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      leftActions.queryByRole("button", { name: enMessages.home.saveAsTemplate }),
    ).not.toBeInTheDocument();

    await user.click(moreButton);
    const templateItem = await screen.findByRole("menuitem", {
      name: enMessages.home.saveAsTemplate,
    });
    await user.click(templateItem);

    expect(templateModalStub.open).toHaveBeenCalledTimes(1);
  });

  it("disables actions and shows reasons when selection is empty", async () => {
    const user = userEvent.setup();

    mockUseUserSession.mockReturnValueOnce({
      data: { is_admin: true, registered: true, username: "User" },
      isLoading: false,
    } as ReturnType<typeof useUserSession>);

    mockUseBiomarkerSelection.mockReturnValueOnce({
      ...selectionStub,
      selected: [],
      biomarkerCodes: [],
      selectionPayload: [],
    } as ReturnType<typeof useBiomarkerSelection>);

    renderWithIntl(<Home />);

    const layout = screen.getByTestId("optimizer-layout");
    const leftRail = layout.querySelector('[data-slot="left"]') as HTMLElement;
    const leftActions = within(leftRail);

    const saveButton = leftActions.getByRole("button", {
      name: enMessages.common.savePanel,
    });
    const shareButton = leftActions.getByRole("button", { name: enMessages.common.share });
    const loadButton = leftActions.getByRole("button", {
      name: enMessages.common.loadPanel,
    });
    const moreButton = leftActions.getByRole("button", { name: enMessages.common.more });

    expect(saveButton).toBeDisabled();
    expect(shareButton).toBeDisabled();
    expect(loadButton).toBeDisabled();
    expect(moreButton).toBeDisabled();

    const saveTrigger = saveButton.parentElement as HTMLElement;
    await user.hover(saveTrigger);
    expect(
      await screen.findByRole("tooltip", { name: enMessages.home.saveDisabledEmpty }),
    ).toBeInTheDocument();
    await user.unhover(saveTrigger);

    const shareTrigger = shareButton.parentElement as HTMLElement;
    await user.hover(shareTrigger);
    expect(
      await screen.findByRole("tooltip", { name: enMessages.home.shareDisabledEmpty }),
    ).toBeInTheDocument();
    await user.unhover(shareTrigger);

    const loadTrigger = loadButton.parentElement as HTMLElement;
    await user.hover(loadTrigger);
    expect(
      await screen.findByRole("tooltip", { name: enMessages.loadMenu.noSavedLists }),
    ).toBeInTheDocument();
    await user.unhover(loadTrigger);

    const moreTrigger = moreButton.parentElement as HTMLElement;
    await user.hover(moreTrigger);
    expect(
      await screen.findByRole("tooltip", { name: enMessages.home.templateDisabledEmpty }),
    ).toBeInTheDocument();
  });
});
