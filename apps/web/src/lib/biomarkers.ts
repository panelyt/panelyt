import { BiomarkerBatchResponseSchema, type Biomarker } from "@panelyt/types";

import { postParsedJson } from "./http";

export const normalizeBiomarkerCode = (value: string) => value.trim().toUpperCase();

const BIOMARKER_BATCH_LIMIT = 200;
const MAX_CONCURRENT_BATCHES = 4;

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
  const chunks = chunkCodes(uniqueCodes);
  const inFlight = new Set<Promise<void>>();

  const runChunk = async (chunk: string[]) => {
    const response = await postParsedJson(
      `/catalog/biomarkers/batch?institution=${institutionId}`,
      BiomarkerBatchResponseSchema,
      { codes: chunk },
    );
    for (const [code, value] of Object.entries(response.results)) {
      results[code] = value;
      const normalized = normalizeBiomarkerCode(code);
      if (normalized && !(normalized in results)) {
        results[normalized] = value;
      }
    }
  };

  for (const chunk of chunks) {
    let task: Promise<void>;
    task = runChunk(chunk).finally(() => {
      inFlight.delete(task);
    });
    inFlight.add(task);
    if (inFlight.size >= MAX_CONCURRENT_BATCHES) {
      await Promise.race(inFlight);
    }
  }

  if (inFlight.size > 0) {
    await Promise.all(inFlight);
  }

  for (const code of uniqueCodes) {
    if (!(code in results)) {
      results[code] = null;
    }
    const normalized = normalizeBiomarkerCode(code);
    if (normalized && !(normalized in results)) {
      results[normalized] = results[code];
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
