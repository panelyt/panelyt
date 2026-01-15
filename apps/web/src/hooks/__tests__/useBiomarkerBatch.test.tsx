import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBiomarkerBatch } from "../useBiomarkerBatch";

vi.mock("../useInstitution", () => ({
  useInstitution: () => ({ institutionId: 1135, label: null, setInstitution: vi.fn() }),
}));

vi.mock("../../lib/biomarkers", () => ({
  fetchBiomarkerBatch: vi.fn(),
  normalizeBiomarkerCode: (value: string) => value.trim().toUpperCase(),
  normalizeBiomarkerBatchResults: (value: Record<string, unknown>) => value,
}));

import { fetchBiomarkerBatch } from "../../lib/biomarkers";

describe("useBiomarkerBatch", () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { Wrapper, queryClient };
  };

  beforeEach(() => {
    vi.mocked(fetchBiomarkerBatch).mockReset();
  });

  it("maps cached normalized results back to requested casing", async () => {
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["biomarker-batch", ["ALT"], 1135], {
      ALT: {
        id: 1,
        name: "Alanine aminotransferase",
        elab_code: "ALT",
        slug: "alt",
        price_now_grosz: 1000,
      },
    });

    const { result } = renderHook(() => useBiomarkerBatch(["alt"]), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.alt?.elab_code).toBe("ALT");
    expect(fetchBiomarkerBatch).not.toHaveBeenCalled();
  });
});
