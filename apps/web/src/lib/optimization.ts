export const buildOptimizationKey = (codes: string[]) =>
  codes.map((code) => code.trim().toLowerCase()).sort().join("|");
