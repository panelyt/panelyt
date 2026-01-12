import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInstitution } from "../useInstitution";
import {
  DEFAULT_INSTITUTION_ID,
  useInstitutionStore,
} from "../../stores/institutionStore";

vi.mock("../useAccountSettings", () => ({
  useAccountSettings: vi.fn(),
}));

vi.mock("../useUserSession", () => ({
  useUserSession: vi.fn(),
}));

import { useAccountSettings } from "../useAccountSettings";
import { useUserSession } from "../useUserSession";

describe("useInstitution", () => {
  beforeEach(() => {
    localStorage.clear();
    useInstitutionStore.setState({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
    });
    useInstitutionStore.persist.clearStorage();
  });

  it("hydrates the store from account settings when available", async () => {
    vi.mocked(useUserSession).mockReturnValue({ data: { user_id: "user-1" } });
    vi.mocked(useAccountSettings).mockReturnValue({
      settingsQuery: {
        data: {
          preferred_institution_id: 2222,
          preferred_institution_label: "Warsaw",
        },
      },
      updateSettingsMutation: { mutate: vi.fn() },
    });

    renderHook(() => useInstitution());

    await waitFor(() => {
      expect(useInstitutionStore.getState().institutionId).toBe(2222);
    });
    expect(useInstitutionStore.getState().label).toBe("Warsaw");
  });

  it("updates the account settings when selection changes for logged-in users", () => {
    const mutate = vi.fn();
    vi.mocked(useUserSession).mockReturnValue({ data: { user_id: "user-1" } });
    vi.mocked(useAccountSettings).mockReturnValue({
      settingsQuery: { data: null },
      updateSettingsMutation: { mutate },
    });

    const { result } = renderHook(() => useInstitution());

    act(() => {
      result.current.setInstitution({ id: 3333, label: "Gdansk" });
    });

    expect(useInstitutionStore.getState().institutionId).toBe(3333);
    expect(mutate).toHaveBeenCalledWith({ preferred_institution_id: 3333 });
  });

  it("does not update account settings for anonymous users", () => {
    const mutate = vi.fn();
    vi.mocked(useUserSession).mockReturnValue({ data: null });
    vi.mocked(useAccountSettings).mockReturnValue({
      settingsQuery: { data: null },
      updateSettingsMutation: { mutate },
    });

    const { result } = renderHook(() => useInstitution());

    act(() => {
      result.current.setInstitution({ id: 3333, label: "Gdansk" });
    });

    expect(useInstitutionStore.getState().institutionId).toBe(3333);
    expect(mutate).not.toHaveBeenCalled();
  });
});
