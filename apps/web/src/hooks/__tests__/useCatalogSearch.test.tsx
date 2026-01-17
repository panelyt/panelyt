import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCatalogSearch } from "../useCatalogSearch";
import { HttpResponse, http, server } from "../../test/msw";

vi.mock("../useInstitution", () => ({
  useInstitution: () => ({ institutionId: 2222, label: null, setInstitution: vi.fn() }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCatalogSearch", () => {
  it("requests catalog search with query params", async () => {
    let lastUrl: URL | null = null;

    server.use(
      http.get("http://localhost:8000/catalog/search", ({ request }) => {
        lastUrl = new URL(request.url);
        return HttpResponse.json({
          results: [
            {
              type: "biomarker",
              id: 1,
              name: "ALT",
              elab_code: "ALT",
              slug: "alt",
              price_now_grosz: 1200,
            },
          ],
        });
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCatalogSearch("ALT"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastUrl?.searchParams.get("query")).toBe("ALT");
    expect(lastUrl?.searchParams.get("institution")).toBe("2222");
  });

  it("surfaces schema errors for invalid catalog payloads", async () => {
    server.use(
      http.get("http://localhost:8000/catalog/search", () => {
        return HttpResponse.json({ invalid: true });
      }),
    );

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCatalogSearch("ALT"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
