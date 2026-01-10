import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const globalsCssPath = resolve(process.cwd(), "src/app/globals.css");
const globalsCss = readFileSync(globalsCssPath, "utf8");

describe("globals.css", () => {
  it("points @config at the app root tailwind config", () => {
    expect(globalsCss).toContain('@config "../../tailwind.config.ts";');
  });

  it("scans source files from the app root", () => {
    expect(globalsCss).toContain('@source "../**/*.{ts,tsx}";');
  });
});
