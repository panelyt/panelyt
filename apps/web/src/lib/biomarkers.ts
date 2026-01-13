import type { Biomarker } from "@panelyt/types";

export const normalizeBiomarkerToken = (value: string | null | undefined) =>
  value?.trim().toLowerCase();

export const normalizeBiomarkerCode = (value: string) => value.trim().toUpperCase();

export const findBiomarkerMatch = (results: Biomarker[], code: string) => {
  const normalizedCode = normalizeBiomarkerToken(code);
  if (!normalizedCode) {
    return undefined;
  }

  return results.find((result) => {
    const normalizedElab = normalizeBiomarkerToken(result.elab_code);
    const normalizedSlug = normalizeBiomarkerToken(result.slug);
    const normalizedName = normalizeBiomarkerToken(result.name);
    return (
      normalizedElab === normalizedCode ||
      normalizedSlug === normalizedCode ||
      normalizedName === normalizedCode
    );
  });
};

export const resolveBiomarkerPrice = (
  prices: Record<string, number | null>,
  code: string,
) => {
  const direct = prices[code];
  if (typeof direct === "number") {
    return direct;
  }
  const normalized = normalizeBiomarkerCode(code);
  const normalizedPrice = prices[normalized];
  return typeof normalizedPrice === "number" ? normalizedPrice : null;
};

export const sumSelectedBiomarkerPrices = (
  codes: string[],
  prices: Record<string, number | null>,
) => {
  const seen = new Set<string>();
  return codes.reduce((sum, code) => {
    const normalized = normalizeBiomarkerCode(code);
    if (!normalized || seen.has(normalized)) {
      return sum;
    }
    seen.add(normalized);
    const price = resolveBiomarkerPrice(prices, code);
    return sum + (price ?? 0);
  }, 0);
};
