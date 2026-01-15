import { describe, expect, it, vi } from "vitest";

import { fetchBiomarkerBatch } from "../biomarkers";

vi.mock("../http", () => ({
  postParsedJson: vi.fn(),
}));

import { postParsedJson } from "../http";

describe("fetchBiomarkerBatch", () => {
  it("fires chunk requests in parallel", async () => {
    const pending: Array<(value: { results: Record<string, null> }) => void> = [];
    vi.mocked(postParsedJson).mockImplementation(() =>
      new Promise((resolve) => {
        pending.push(resolve as (value: { results: Record<string, null> }) => void);
      }),
    );

    const codes = Array.from({ length: 401 }, (_, index) => `CODE-${index}`);
    const promise = fetchBiomarkerBatch(codes, 123);

    expect(postParsedJson).toHaveBeenCalledTimes(3);

    for (const resolve of pending) {
      resolve({ results: {} });
    }

    const result = await promise;
    expect(Object.keys(result)).toHaveLength(codes.length);
  });
});
