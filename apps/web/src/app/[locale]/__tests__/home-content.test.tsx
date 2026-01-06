import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { renderWithIntl } from "../../../test/utils";

vi.mock("../../../hooks/useUserSession", () => ({
  useUserSession: vi.fn(),
}));

vi.mock("../../../hooks/useSavedLists", () => ({
  useSavedLists: vi.fn(),
}));

vi.mock("../../../hooks/useLabOptimization", () => ({
  useLabOptimization: vi.fn(),
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

vi.mock("../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
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

vi.mock("../../../components/load-menu", () => ({
  LoadMenu: () => <div data-testid="load-menu" />,
}));

import { useUserSession } from "../../../hooks/useUserSession";
import { useSavedLists } from "../../../hooks/useSavedLists";
import { useLabOptimization } from "../../../hooks/useLabOptimization";
import { useBiomarkerSelection } from "../../../hooks/useBiomarkerSelection";
import { useUrlParamSync } from "../../../hooks/useUrlParamSync";
import { useUrlBiomarkerSync } from "../../../hooks/useUrlBiomarkerSync";
import { useSaveListModal } from "../../../hooks/useSaveListModal";
import { useTemplateModal } from "../../../hooks/useTemplateModal";
import Home from "../home-content";

const mockUseUserSession = vi.mocked(useUserSession);
const mockUseSavedLists = vi.mocked(useSavedLists);
const mockUseLabOptimization = vi.mocked(useLabOptimization);
const mockUseBiomarkerSelection = vi.mocked(useBiomarkerSelection);
const mockUseUrlParamSync = vi.mocked(useUrlParamSync);
const mockUseUrlBiomarkerSync = vi.mocked(useUrlBiomarkerSync);
const mockUseSaveListModal = vi.mocked(useSaveListModal);
const mockUseTemplateModal = vi.mocked(useTemplateModal);

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

    mockUseUserSession.mockReturnValue({
      data: { is_admin: false, registered: true, username: "User" },
      isLoading: false,
    } as ReturnType<typeof useUserSession>);

    mockUseSavedLists.mockReturnValue(
      {
        listsQuery: { data: [], isFetching: false },
      } as unknown as ReturnType<typeof useSavedLists>,
    );

    mockUseLabOptimization.mockReturnValue({
      activeResult: undefined,
      activeLoading: false,
      activeError: null,
      labCards: [],
      labChoice: null,
      selectLab: vi.fn(),
      addonSuggestions: [],
      addonSuggestionsLoading: false,
      resetLabChoice: vi.fn(),
    } as ReturnType<typeof useLabOptimization>);

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
  });

  it("renders the two-rail layout with a sticky summary bar when selection exists", () => {
    renderWithIntl(<Home />);

    const layout = screen.getByTestId("optimizer-layout");
    const rightRail = layout.querySelector('[data-slot="right"]');

    expect(layout).toBeInTheDocument();
    expect(screen.getByTestId("sticky-summary-bar")).toBeInTheDocument();
    expect(rightRail).toContainElement(screen.getByTestId("optimization-results"));
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

    await user.click(screen.getByRole("button", { name: /share/i }));

    expect(copyShareUrl).toHaveBeenCalled();
    expect(await screen.findByText("Share link copied.")).toBeInTheDocument();
  });
});
