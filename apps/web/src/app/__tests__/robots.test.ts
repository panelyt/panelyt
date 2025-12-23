import { describe, it, expect } from "vitest";

import { BASE_URL } from "@/lib/config";

import robots from "../robots";

describe("robots", () => {
  it("returns correct robots.txt configuration", () => {
    const result = robots();

    expect(result).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: `${BASE_URL}/sitemap.xml`,
    });
  });

  it("does not include disallow rules", () => {
    const result = robots();

    expect(result.rules).not.toHaveProperty("disallow");
  });
});
