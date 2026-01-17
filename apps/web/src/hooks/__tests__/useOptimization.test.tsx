import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useAddonSuggestions, useOptimization } from "../useOptimization";
import { HttpResponse, http, server } from "../../test/msw";

vi.mock("../useInstitution", () => ({
  useInstitution: () => ({ institutionId: 2222, label: null, setInstitution: vi.fn() }),
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

const optimizeResponse = {
  total_now: 12.34,
  total_min30: 12.34,
  currency: "PLN",
  items: [
    {
      id: 1,
      kind: "single",
      name: "ALT",
      slug: "alt",
      price_now_grosz: 1234,
      price_min30_grosz: 1234,
      currency: "PLN",
      biomarkers: ["ALT"],
      url: "https://example.com/alt",
      on_sale: false,
      is_synthetic_package: false,
    },
  ],
  explain: {},
  uncovered: [],
};

describe("useOptimization", () => {
  it("includes institution id in optimize query keys and request", async () => {
    let lastUrl: URL | null = null;
    let lastBody: unknown = null;

    server.use(
      http.post("http://localhost:8000/optimize", async ({ request }) => {
        lastUrl = new URL(request.url);
        lastBody = await request.json();
        return HttpResponse.json(optimizeResponse);
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useOptimization(["ALT"]), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().findAll().map((query) => query.queryKey);
    expect(keys).toContainEqual(["optimize", "alt", 2222]);
    expect(lastUrl?.searchParams.get("institution")).toBe("2222");
    expect(lastBody).toEqual({ biomarkers: ["ALT"] });
  });

  it("surfaces schema errors for invalid optimize payloads", async () => {
    server.use(
      http.post("http://localhost:8000/optimize", () => {
        return HttpResponse.json({ total_now: 0 });
      }),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useOptimization(["ALT"]), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAddonSuggestions", () => {
  it("includes institution id and selected ids in addon request", async () => {
    let lastUrl: URL | null = null;
    let lastBody: unknown = null;

    server.use(
      http.post("http://localhost:8000/optimize/addons", async ({ request }) => {
        lastUrl = new URL(request.url);
        lastBody = await request.json();
        return HttpResponse.json({ addon_suggestions: [], labels: {} });
      }),
    );

    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(
      () => useAddonSuggestions(["ALT"], [1, 2], true),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient.getQueryCache().findAll().map((query) => query.queryKey);
    expect(keys).toContainEqual(["optimize-addons", "alt", "1,2", 2222]);
    expect(lastUrl?.searchParams.get("institution")).toBe("2222");
    expect(lastBody).toEqual({ biomarkers: ["ALT"], selected_item_ids: [1, 2] });
  });
});
