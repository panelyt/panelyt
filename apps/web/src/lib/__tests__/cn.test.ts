import { describe, expect, it } from "vitest";

import { cn } from "../cn";

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    const result = cn("p-2", "text-sm", false && "hidden", "p-4");

    expect(result).toContain("text-sm");
    expect(result).toContain("p-4");
    expect(result).not.toContain("p-2");
  });

  it("supports conditional class objects", () => {
    const result = cn("text-sm", { "font-bold": true, "text-lg": false });

    expect(result).toContain("text-sm");
    expect(result).toContain("font-bold");
    expect(result).not.toContain("text-lg");
  });
});
