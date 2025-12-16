"use client";

import { useQuery } from "@tanstack/react-query";
import { BiomarkerSearchResponseSchema } from "@/lib/types";

import { getJson } from "../lib/http";

export function useBiomarkerLookup(codes: string[]) {
  return useQuery<Record<string, string>, Error>({
    queryKey: ["biomarker-lookup", codes.sort()],
    queryFn: async () => {
      const lookup: Record<string, string> = {};

      // Use multiple search strategies to find biomarker names
      for (const code of codes) {
        let found = false;

        // Strategy 1: Search for each code individually (try different query approaches)
        const searchTerms = [
          code,
          `${code} `,  // Code with space
          ` ${code}`,  // Code with leading space
          `"${code}"`, // Quoted code
        ];

        for (const term of searchTerms) {
          if (found) break;

          try {
            const payload = await getJson(`/catalog/biomarkers?query=${encodeURIComponent(term)}`);
            const response = BiomarkerSearchResponseSchema.parse(payload);

            // Find exact match by elab_code
            const match = response.results.find(b => b.elab_code === code);
            if (match) {
              lookup[code] = match.name;
              found = true;
              break;
            }
          } catch {
            // Continue to next search term
          }
        }

        // Strategy 2: If still not found, try searching by partial names we know
        if (!found) {
          const knownPartialNames = {
            '3': 'morfologia',
            '10': 'glukoza',
            '14': 'lipidogram',
            '19': 'wątrobowe',
            '75': 'CK',
          } as Record<string, string>;

          const partialName = knownPartialNames[code];
          if (partialName) {
            try {
              const payload = await getJson(`/catalog/biomarkers?query=${encodeURIComponent(partialName)}`);
              const response = BiomarkerSearchResponseSchema.parse(payload);

              const match = response.results.find(b => b.elab_code === code);
              if (match) {
                lookup[code] = match.name;
                found = true;
              }
            } catch {
              // Fallback handled below
            }
          }
        }

        // Final fallback: use code as display name
        if (!found) {
          lookup[code] = code;
        }
      }

      return lookup;
    },
    enabled: codes.length > 0,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });
}