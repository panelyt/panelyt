import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTemplatePricing } from "../useBiomarkerListTemplates";
import type { BiomarkerListTemplate } from "@panelyt/types";

const postParsedJson = vi.fn();

vi.mock("../useInstitution", () => ({
  useInstitution: () => ({ institutionId: 1135, label: null, setInstitution: vi.fn() }),
}));

vi.mock("../../lib/http", () => ({
  postParsedJson: (...args: unknown[]) => postParsedJson(...args),
  getParsedJson: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const makeTemplate = (slug: string, id: number): BiomarkerListTemplate => ({
  id,
  slug,
  name: slug,
  description: null,
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-05T00:00:00Z",
  biomarkers: [
    {
      id,
      code: `B${id}`,
      display_name: `B${id}`,
      sort_order: 0,
      biomarker: null,
      notes: null,
    },
  ],
});

describe("useTemplatePricing", () => {
  beforeEach(() => {
    postParsedJson.mockReset();
  });

  it("limits concurrent optimize requests", async () => {
    const templates = Array.from({ length: 6 }, (_, index) =>
      makeTemplate(`template-${index + 1}`, index + 1),
    );

    const inFlight = { count: 0, max: 0 };
    const deferreds: Array<() => void> = [];

    postParsedJson.mockImplementation(() => {
      inFlight.count += 1;
      inFlight.max = Math.max(inFlight.max, inFlight.count);
      return new Promise((resolve) => {
        deferreds.push(() => {
          inFlight.count -= 1;
          resolve({ total_now: 123 } as unknown);
        });
      });
    });

    const wrapper = createWrapper();
    renderHook(() => useTemplatePricing(templates), { wrapper });

    await waitFor(() => expect(postParsedJson).toHaveBeenCalledTimes(4));
    expect(inFlight.max).toBeLessThanOrEqual(4);

    act(() => {
      deferreds.shift()?.();
    });

    await waitFor(() => expect(postParsedJson).toHaveBeenCalledTimes(5));

    act(() => {
      while (deferreds.length > 0) {
        deferreds.shift()?.();
      }
    });
  });
});
