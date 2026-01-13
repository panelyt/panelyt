import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useAddonSuggestions, useOptimization } from "../useOptimization";
import { postParsedJson } from "../../lib/http";

vi.mock("../useInstitution", () => ({
  useInstitution: () => ({ institutionId: 2222, label: null, setInstitution: vi.fn() }),
}));

vi.mock("../../lib/http", () => ({
  postParsedJson: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    },
  };
}

describe("useOptimization", () => {
  it("includes institution id in optimize query keys", async () => {
    vi.mocked(postParsedJson).mockResolvedValue({ total_now: 0 } as unknown);

    const { Wrapper, queryClient } = createWrapper();
    renderHook(() => useOptimization(["ALT"]), { wrapper: Wrapper });

    await waitFor(() => {
      const keys = queryClient.getQueryCache().findAll().map((query) => query.queryKey);
      expect(keys).toContainEqual(["optimize", "alt", 2222]);
    });
  });

  it("includes institution id in addon suggestion query keys", async () => {
    vi.mocked(postParsedJson).mockResolvedValue({ addon_suggestions: [] } as unknown);

    const { Wrapper, queryClient } = createWrapper();
    renderHook(() => useAddonSuggestions(["ALT"], [1], true), { wrapper: Wrapper });

    await waitFor(() => {
      const keys = queryClient.getQueryCache().findAll().map((query) => query.queryKey);
      expect(keys).toContainEqual(["optimize-addons", "alt", "1", 2222]);
    });
  });
});
