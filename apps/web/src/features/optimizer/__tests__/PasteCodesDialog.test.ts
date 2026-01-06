import { describe, expect, it } from "vitest";

import { parsePastedCodes } from "../PasteCodesDialog";

describe("parsePastedCodes", () => {
  it("normalizes, uppercases, and dedupes codes", () => {
    const result = parsePastedCodes(" alt, AST\nalt ");

    expect(result.codes).toEqual(["ALT", "AST"]);
    expect(result.error).toBeNull();
  });

  it("returns an empty error when nothing is provided", () => {
    const result = parsePastedCodes("\n, , ");

    expect(result.codes).toEqual([]);
    expect(result.error).toBe("empty");
  });

  it("returns a too_long error when the limit is exceeded", () => {
    const result = parsePastedCodes("ALT,AST,CRP", 2);

    expect(result.error).toBe("too_long");
  });
});
