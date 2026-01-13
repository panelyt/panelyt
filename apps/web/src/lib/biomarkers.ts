import { BiomarkerBatchResponseSchema, type Biomarker } from "@panelyt/types";

import { postParsedJson } from "./http";

export const normalizeBiomarkerCode = (value: string) => value.trim().toUpperCase();

const BIOMARKER_BATCH_LIMIT = 200;

const chunkCodes = (codes: string[]) => {
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += BIOMARKER_BATCH_LIMIT) {
    chunks.push(codes.slice(i, i + BIOMARKER_BATCH_LIMIT));
  }
  return chunks;
};

export const fetchBiomarkerBatch = async (
  codes: string[],
  institutionId: number,
): Promise<Record<string, Biomarker | null>> => {
  const trimmedCodes = codes.map((code) => code.trim()).filter(Boolean);
  const uniqueCodes = Array.from(new Set(trimmedCodes));
  if (uniqueCodes.length === 0) {
    return {};
  }

  const results: Record<string, Biomarker | null> = {};
  for (const chunk of chunkCodes(uniqueCodes)) {
    const response = await postParsedJson(
      `/catalog/biomarkers/batch?institution=${institutionId}`,
      BiomarkerBatchResponseSchema,
      { codes: chunk },
    );
    Object.assign(results, response.results);
  }

  for (const code of uniqueCodes) {
    if (!(code in results)) {
      results[code] = null;
    }
  }

  return results;
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
