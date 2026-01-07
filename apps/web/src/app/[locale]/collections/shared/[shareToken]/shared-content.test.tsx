import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";

import { renderWithQueryClient } from "../../../../../test/utils";
import enMessages from "../../../../../i18n/messages/en.json";
import { useSharedList } from "../../../../../hooks/useSharedList";
import { useLabOptimization } from "../../../../../hooks/useLabOptimization";
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

vi.mock("../../../../../hooks/useLabOptimization", () => ({
  useLabOptimization: vi.fn(),
}));

const mockUseSharedList = vi.mocked(useSharedList);
const mockUseLabOptimization = vi.mocked(useLabOptimization);
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
      biomarker_id: null,
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
      lab_code: "diag",
      lab_name: "Diag",
    },
  ],
  bonus_total_now: 0,
  explain: {},
  uncovered: [],
  lab_code: "diag",
  lab_name: "Diag",
  exclusive: {},
  labels: {
    ALT: "ALT",
  },
  mode: "auto",
  lab_options: [],
  lab_selections: [],
  addon_suggestions: [],
};

const renderContent = async () => {
  await act(async () => {
    renderWithQueryClient(
      <SharedContent shareToken="token-123" />,
    );
  });
};

describe("SharedContent", () => {
  beforeEach(() => {
    mockUseSharedList.mockReturnValue({
      data: sharedListData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSharedList>);
    mockUseLabOptimization.mockReturnValue({
      labCards: [
        {
          key: "diag",
          title: "DIAG",
          shortLabel: "DIAG",
          priceLabel: "120",
          priceValue: 120,
          meta: "",
          badge: undefined,
          active: true,
          loading: false,
          disabled: false,
          onSelect: vi.fn(),
          icon: null,
          accentLight: "",
          accentDark: "",
          coversAll: true,
        },
      ],
      activeResult: sampleResult,
      activeLoading: false,
      activeError: null,
      optimizationKey: "alt-ast",
      labChoice: "diag",
      selectLab: vi.fn(),
      resetLabChoice: vi.fn(),
      addonSuggestions: [],
      addonSuggestionsLoading: false,
    } as ReturnType<typeof useLabOptimization>);
    mockUseRouter.mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useRouter>);
  });

  it("shows compare lab tabs for shared list pricing", async () => {
    await renderContent();

    expect(
      await screen.findByText(enMessages.optimization.bestPrices),
    ).toBeInTheDocument();
  });
});
