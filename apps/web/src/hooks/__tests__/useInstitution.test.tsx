import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInstitution } from "../useInstitution";
import {
  DEFAULT_INSTITUTION_ID,
  useInstitutionStore,
} from "../../stores/institutionStore";
import { usePanelStore } from "../../stores/panelStore";

vi.mock("../useAccountSettings", () => ({
  useAccountSettings: vi.fn(),
}));

vi.mock("../useUserSession", () => ({
  useUserSession: vi.fn(),
}));

vi.mock("../../lib/biomarkers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/biomarkers")>();
  return {
    ...actual,
    fetchBiomarkerBatch: vi.fn().mockResolvedValue({}),
  };
});

import { useAccountSettings } from "../useAccountSettings";
import { useUserSession } from "../useUserSession";
import { fetchBiomarkerBatch } from "../../lib/biomarkers";

describe("useInstitution", () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) => {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
    return { Wrapper, queryClient };
  };

  beforeEach(() => {
    localStorage.clear();
    useInstitutionStore.setState({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
      hasSelectedInstitution: false,
    });
    useInstitutionStore.persist.clearStorage();
    usePanelStore.setState({ selected: [] });
    vi.mocked(fetchBiomarkerBatch).mockClear();
  });

  it("hydrates the store from account settings when available", async () => {
    vi.mocked(useUserSession).mockReturnValue(
      {
        data: {
          user_id: "user-1",
          username: "egor",
          registered: true,
          is_admin: false,
        },
        isLoading: false,
      } as ReturnType<typeof useUserSession>,
    );
    vi.mocked(useAccountSettings).mockReturnValue(
      {
        settingsQuery: {
          data: {
            telegram: {
              enabled: false,
              chat_id: null,
              linked_at: null,
              link_token: null,
              link_token_expires_at: null,
              bot_username: null,
              link_url: null,
            },
            preferred_institution_id: 2222,
            preferred_institution_label: "Warsaw",
          },
          isLoading: false,
        },
        updateSettingsMutation: { mutate: vi.fn() },
      } as unknown as ReturnType<typeof useAccountSettings>,
    );

    const { Wrapper } = createWrapper();
    renderHook(() => useInstitution(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(useInstitutionStore.getState().institutionId).toBe(2222);
    });
    expect(useInstitutionStore.getState().label).toBe("Warsaw");
  });

  it("updates the account settings when selection changes for logged-in users", () => {
    const mutate = vi.fn();
    vi.mocked(useUserSession).mockReturnValue(
      {
        data: {
          user_id: "user-1",
          username: "egor",
          registered: true,
          is_admin: false,
        },
        isLoading: false,
      } as ReturnType<typeof useUserSession>,
    );
    vi.mocked(useAccountSettings).mockReturnValue(
      {
        settingsQuery: {
          data: {
            telegram: {
              enabled: false,
              chat_id: null,
              linked_at: null,
              link_token: null,
              link_token_expires_at: null,
              bot_username: null,
              link_url: null,
            },
            preferred_institution_id: null,
            preferred_institution_label: null,
          },
          isLoading: false,
        },
        updateSettingsMutation: { mutate },
      } as unknown as ReturnType<typeof useAccountSettings>,
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInstitution(), { wrapper: Wrapper });

    act(() => {
      result.current.setInstitution({ id: 3333, label: "Gdansk" });
    });

    expect(useInstitutionStore.getState().institutionId).toBe(3333);
    expect(mutate).toHaveBeenCalledWith({ preferred_institution_id: 3333 });
  });

  it("does not update account settings for anonymous users", () => {
    const mutate = vi.fn();
    vi.mocked(useUserSession).mockReturnValue(
      { data: null, isLoading: false } as ReturnType<typeof useUserSession>,
    );
    vi.mocked(useAccountSettings).mockReturnValue(
      {
        settingsQuery: {
          data: {
            telegram: {
              enabled: false,
              chat_id: null,
              linked_at: null,
              link_token: null,
              link_token_expires_at: null,
              bot_username: null,
              link_url: null,
            },
            preferred_institution_id: null,
            preferred_institution_label: null,
          },
          isLoading: false,
        },
        updateSettingsMutation: { mutate },
      } as unknown as ReturnType<typeof useAccountSettings>,
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInstitution(), { wrapper: Wrapper });

    act(() => {
      result.current.setInstitution({ id: 3333, label: "Gdansk" });
    });

    expect(useInstitutionStore.getState().institutionId).toBe(3333);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("syncs local selection to account when user logs in without a preference", async () => {
    const mutate = vi.fn();
    useInstitutionStore.setState({
      institutionId: 4444,
      label: "Katowice",
      hasSelectedInstitution: true,
    });
    vi.mocked(useUserSession).mockReturnValue(
      {
        data: {
          user_id: "user-2",
          username: "egor",
          registered: true,
          is_admin: false,
        },
        isLoading: false,
      } as ReturnType<typeof useUserSession>,
    );
    vi.mocked(useAccountSettings).mockReturnValue(
      {
        settingsQuery: {
          data: {
            telegram: {
              enabled: false,
              chat_id: null,
              linked_at: null,
              link_token: null,
              link_token_expires_at: null,
              bot_username: null,
              link_url: null,
            },
            preferred_institution_id: null,
            preferred_institution_label: null,
          },
          isLoading: false,
        },
        updateSettingsMutation: { mutate },
      } as unknown as ReturnType<typeof useAccountSettings>,
    );

    const { Wrapper } = createWrapper();
    renderHook(() => useInstitution(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith({ preferred_institution_id: 4444 });
    });
  });

  it("prefetches biomarker batches when the institution changes", async () => {
    vi.mocked(useUserSession).mockReturnValue(
      { data: null, isLoading: false } as ReturnType<typeof useUserSession>,
    );
    vi.mocked(useAccountSettings).mockReturnValue(
      {
        settingsQuery: {
          data: {
            telegram: {
              enabled: false,
              chat_id: null,
              linked_at: null,
              link_token: null,
              link_token_expires_at: null,
              bot_username: null,
              link_url: null,
            },
            preferred_institution_id: null,
            preferred_institution_label: null,
          },
          isLoading: false,
        },
        updateSettingsMutation: { mutate: vi.fn() },
      } as unknown as ReturnType<typeof useAccountSettings>,
    );

    usePanelStore.setState({
      selected: [{ code: "ALT", name: "ALT" }],
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useInstitution(), { wrapper: Wrapper });

    act(() => {
      result.current.setInstitution({ id: 9999, label: "Lodz" });
    });

    await waitFor(() => {
      expect(fetchBiomarkerBatch).toHaveBeenCalledWith(["ALT"], 9999);
    });
  });
});
