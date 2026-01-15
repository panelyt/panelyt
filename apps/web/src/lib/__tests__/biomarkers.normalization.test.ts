import { describe, expect, it, vi } from "vitest";

import { fetchBiomarkerBatch } from "../biomarkers";

vi.mock("../http", () => ({
  postParsedJson: vi.fn(),
}));

import { postParsedJson } from "../http";

describe("fetchBiomarkerBatch normalization", () => {
  it("exposes normalized keys for cached lookups", async () => {
    vi.mocked(postParsedJson).mockResolvedValue({
      results: {
        alt: {
          id: 1,
          name: "Alanine aminotransferase",
          elab_code: "ALT",
          slug: "alt",
          price_now_grosz: 1200,
        },
      },
    });

    const result = await fetchBiomarkerBatch(["ALT"], 1135);

    expect(result["ALT"]).toEqual(
      expect.objectContaining({
        elab_code: "ALT",
        slug: "alt",
      }),
    );
  });
});
