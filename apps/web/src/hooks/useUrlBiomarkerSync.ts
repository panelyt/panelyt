"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BiomarkerSearchResponseSchema } from "@panelyt/types";

import { getJson } from "../lib/http";

export interface SelectedBiomarker {
  code: string;
  name: string;
}

const URL_PARAM_NAME = "biomarkers";
const URL_UPDATE_DEBOUNCE_MS = 300;

/**
 * Looks up display names for biomarker codes.
 * Returns a map of code -> display name.
 * Falls back to code itself if lookup fails.
 */
async function lookupBiomarkerNames(codes: string[]): Promise<Record<string, string>> {
  const lookup: Record<string, string> = {};

  // Initialize with codes as fallback names
  for (const code of codes) {
    lookup[code] = code;
  }

  if (codes.length === 0) {
    return lookup;
  }

  // Try to find names by searching for each code
  const searchPromises = codes.map(async (code) => {
    try {
      const payload = await getJson(`/catalog/biomarkers?query=${encodeURIComponent(code)}`);
      const response = BiomarkerSearchResponseSchema.parse(payload);

      // Find exact match by elab_code
      const match = response.results.find((b) => b.elab_code === code);
      if (match) {
        lookup[code] = match.name;
      }
    } catch {
      // Keep fallback name (the code itself)
    }
  });

  await Promise.all(searchPromises);
  return lookup;
}

export interface UseUrlBiomarkerSyncOptions {
  /** Current selected biomarkers */
  selected: SelectedBiomarker[];
  /** Called when biomarkers are loaded from URL */
  onLoadFromUrl: (biomarkers: SelectedBiomarker[]) => void;
  /** Whether to skip URL sync (e.g., when other params like ?template= are being processed) */
  skipSync?: boolean;
}

export interface UseUrlBiomarkerSyncResult {
  /** Whether biomarkers are currently being loaded from URL */
  isLoadingFromUrl: boolean;
  /** Get the shareable URL with current biomarkers */
  getShareUrl: () => string;
  /** Copy the shareable URL to clipboard */
  copyShareUrl: () => Promise<boolean>;
}

/**
 * Two-way sync between URL query params and biomarker selection.
 *
 * URL format: ?biomarkers=TSH,T4,T3
 *
 * - On mount: reads codes from URL, looks up names, calls onLoadFromUrl
 * - On selection change: updates URL with current codes
 * - Provides getShareUrl() and copyShareUrl() for sharing
 */
export function useUrlBiomarkerSync(
  options: UseUrlBiomarkerSyncOptions,
): UseUrlBiomarkerSyncResult {
  const { selected, onLoadFromUrl, skipSync = false } = options;

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);

  // Track whether we've done initial load from URL
  const initialLoadDoneRef = useRef(false);
  // Track last written URL to avoid loops
  const lastWrittenCodesRef = useRef<string>("");
  // Debounce timer for URL updates
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if other URL params are present that take precedence
  const hasOtherParams = Boolean(
    searchParams.get("template") ||
    searchParams.get("shared") ||
    searchParams.get("list")
  );

  // Read from URL on mount
  useEffect(() => {
    if (initialLoadDoneRef.current || skipSync || hasOtherParams) {
      return;
    }

    const biomarkersParam = searchParams.get(URL_PARAM_NAME);
    if (!biomarkersParam) {
      initialLoadDoneRef.current = true;
      return;
    }

    const codes = biomarkersParam
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length > 0);

    if (codes.length === 0) {
      initialLoadDoneRef.current = true;
      return;
    }

    // Mark as loading and look up names
    setIsLoadingFromUrl(true);
    initialLoadDoneRef.current = true;
    lastWrittenCodesRef.current = codes.join(",");

    lookupBiomarkerNames(codes)
      .then((nameMap) => {
        const biomarkers = codes.map((code) => ({
          code,
          name: nameMap[code] || code,
        }));
        onLoadFromUrl(biomarkers);
      })
      .finally(() => {
        setIsLoadingFromUrl(false);
      });
  }, [searchParams, skipSync, hasOtherParams, onLoadFromUrl]);

  // Write to URL when selection changes
  useEffect(() => {
    if (!initialLoadDoneRef.current || skipSync || hasOtherParams) {
      return;
    }

    // Clear any pending update
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
    }

    // Debounce URL updates to avoid excessive history entries
    updateTimerRef.current = setTimeout(() => {
      const currentCodes = selected.map((b) => b.code).join(",");

      // Skip if nothing changed
      if (currentCodes === lastWrittenCodesRef.current) {
        return;
      }

      lastWrittenCodesRef.current = currentCodes;

      // Build new URL with updated biomarkers param
      const params = new URLSearchParams(searchParams.toString());

      if (selected.length === 0) {
        params.delete(URL_PARAM_NAME);
      } else {
        params.set(URL_PARAM_NAME, currentCodes);
      }

      const query = params.toString();
      const newUrl = query ? `/?${query}` : "/";

      // Use replace to avoid cluttering browser history
      router.replace(newUrl, { scroll: false });
    }, URL_UPDATE_DEBOUNCE_MS);

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [selected, searchParams, skipSync, hasOtherParams, router]);

  const getShareUrl = useCallback(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const codes = selected.map((b) => b.code).join(",");
    if (!codes) {
      return window.location.origin + "/";
    }

    return `${window.location.origin}/?${URL_PARAM_NAME}=${encodeURIComponent(codes)}`;
  }, [selected]);

  const copyShareUrl = useCallback(async () => {
    const url = getShareUrl();
    if (!url) {
      return false;
    }

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(url);
        return true;
      }

      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }, [getShareUrl]);

  return {
    isLoadingFromUrl,
    getShareUrl,
    copyShareUrl,
  };
}
