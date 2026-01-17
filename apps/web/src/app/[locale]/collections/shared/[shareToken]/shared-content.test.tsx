import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithQueryClient } from "../../../../../test/utils";
import enMessages from "../../../../../i18n/messages/en.json";
import { useSharedList } from "../../../../../hooks/useSharedList";
import { useOptimization, useAddonSuggestions } from "../../../../../hooks/useOptimization";
import { useBiomarkerDiagUrls } from "../../../../../hooks/useBiomarkerDiagUrls";
import { useBiomarkerPrices } from "../../../../../hooks/useBiomarkerPrices";
import { useRouter } from "../../../../../i18n/navigation";
import SharedContent from "./shared-content";

vi.mock("../../../../../components/header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("../../../../../i18n/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("../../../../../hooks/useSharedList", () => ({
  useSharedList: vi.fn(),
}));

vi.mock("../../../../../hooks/useOptimization", () => ({
  useOptimization: vi.fn(),
  useAddonSuggestions: vi.fn(),
}));

vi.mock("../../../../../hooks/useBiomarkerDiagUrls", () => ({
  useBiomarkerDiagUrls: vi.fn(),
}));

vi.mock("../../../../../hooks/useBiomarkerPrices", () => ({
  useBiomarkerPrices: vi.fn(),
}));

const mockUseSharedList = vi.mocked(useSharedList);
const mockUseOptimization = vi.mocked(useOptimization);
const mockUseAddonSuggestions = vi.mocked(useAddonSuggestions);
const mockUseBiomarkerDiagUrls = vi.mocked(useBiomarkerDiagUrls);
const mockUseBiomarkerPrices = vi.mocked(useBiomarkerPrices);
const mockUseRouter = vi.mocked(useRouter);

const sharedListData = {
  id: "list-123",
  name: "Shared Hormones",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  share_token: "token-123",
  shared_at: "2024-01-03T00:00:00Z",
  notify_on_price_drop: false,
  last_known_total_grosz: null,
  last_total_updated_at: null,
  last_notified_total_grosz: null,
  last_notified_at: null,
  biomarkers: [
    {
      id: "entry-1",
      code: "ALT",
      display_name: "ALT",
      sort_order: 0,
      biomarker_id: "bio-1",
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "entry-2",
      code: "AST",
      display_name: "AST",
      sort_order: 1,
      biomarker_id: null,
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
};

const sampleResult = {
  total_now: 120,
  total_min30: 110,
  currency: "PLN",
  items: [
    {
      id: 1,
      kind: "single",
      name: "ALT",
      slug: "alt",
      price_now_grosz: 12000,
      price_min30_grosz: 11000,
      currency: "PLN",
      biomarkers: ["ALT"],
      url: "https://example.com/alt",
      on_sale: false,
    },
  ],
  bonus_total_now: 0,
  bonus_biomarkers: [],
  explain: {},
  uncovered: [],
  labels: {
    ALT: "ALT",
  },
  addon_suggestions: [],
};

const makeAddonSuggestion = () => ({
  package: {
    id: 101,
    kind: "package",
    name: "Liver Panel",
    slug: "liver-panel",
    price_now_grosz: 1000,
    price_min30_grosz: 900,
    currency: "PLN",
    biomarkers: ["ALT"],
    url: "https://example.com/liver-panel",
    on_sale: false,
  },
  upgrade_cost_grosz: 100,
  upgrade_cost: 1,
  estimated_total_now_grosz: 1100,
  estimated_total_now: 11,
  covers: [],
  adds: [{ code: "AST", display_name: "AST" }],
  removes: [],
  keeps: [],
});

const renderContent = async () => {
  await act(async () => {
    renderWithQueryClient(
      <SharedContent shareToken="token-123" />,
    );
  });
};

describe("SharedContent", () => {
  const push = vi.fn();

  beforeEach(() => {
    push.mockReset();
    mockUseSharedList.mockReturnValue({
      data: sharedListData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSharedList>);
    mockUseOptimization.mockReturnValue({
      data: sampleResult,
      isLoading: false,
      error: null,
      optimizationKey: "alt-ast",
      debouncedBiomarkers: ["ALT", "AST"],
    } as unknown as ReturnType<typeof useOptimization>);
    mockUseAddonSuggestions.mockReturnValue({
      data: { addon_suggestions: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useAddonSuggestions>);
    mockUseBiomarkerDiagUrls.mockReturnValue({
      data: {
        ALT: "https://diag.pl/sklep/badania/alt-test",
        AST: "https://diag.pl/sklep/badania/ast-test",
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBiomarkerDiagUrls>);
    mockUseBiomarkerPrices.mockReturnValue({
      data: {},
      isLoading: false,
      isFetching: false,
      error: null,
    } as ReturnType<typeof useBiomarkerPrices>);
    mockUseRouter.mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useRouter>);
  });

  it("shows live pricing content for shared list", async () => {
    await renderContent();

    expect(
      await screen.findByText(enMessages.sharedList.livePricing),
    ).toBeInTheDocument();
  });

  it("navigates to the shared optimizer URL when loading the list", async () => {
    const user = userEvent.setup();

    await renderContent();

    await user.click(
      screen.getByRole("button", { name: enMessages.lists.loadInOptimizer }),
    );

    expect(push).toHaveBeenCalledWith("/?shared=token-123");
  });

  it("formats the shared timestamp using the active locale", async () => {
    const expectedTimestamp = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(sharedListData.shared_at));

    await renderContent();

    const expectedLabel = `${enMessages.sharedList.shared} ${expectedTimestamp}`;
    expect(await screen.findByText(expectedLabel)).toBeInTheDocument();
  });

  it("links shared biomarkers to diag.pl", async () => {
    await renderContent();

    const selectionSection = screen
      .getByText(enMessages.sharedList.selectionOverview)
      .closest("section");
    if (!selectionSection) {
      throw new Error("Selection section not found");
    }
    const altLink = within(selectionSection).getByRole("link", { name: "ALT" });
    expect(altLink).toHaveAttribute("href", "https://diag.pl/sklep/badania/alt-test");

    const astLink = within(selectionSection).getByRole("link", { name: "AST" });
    expect(astLink).toHaveAttribute("href", "https://diag.pl/sklep/badania/ast-test");
  });

  it("hides biomarker IDs on the shared list page", async () => {
    await renderContent();

    expect(
      screen.queryByText(
        new RegExp(enMessages.sharedList.mappedBiomarkerId, "i"),
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("bio-1")).not.toBeInTheDocument();
  });

  it("hides addon suggestions on the shared list page", async () => {
    mockUseAddonSuggestions.mockReturnValue({
      data: { addon_suggestions: [makeAddonSuggestion()] },
      isLoading: false,
    } as unknown as ReturnType<typeof useAddonSuggestions>);

    await renderContent();

    expect(
      screen.queryByText(enMessages.optimization.addMoreForLess),
    ).not.toBeInTheDocument();
  });
});
