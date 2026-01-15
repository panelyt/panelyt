"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";
import { defaultLocale } from "../i18n/config";

import {
  fetchBiomarkerBatch,
  normalizeBiomarkerBatchResults,
  normalizeBiomarkerCode,
} from "../lib/biomarkers";
import { useInstitution } from "./useInstitution";

export interface SelectedBiomarker {
  code: string;
  name: string;
}

const URL_PARAM_NAME = "biomarkers";
const URL_UPDATE_DEBOUNCE_MS = 300;

/**
 * Looks up display names for biomarker codes.
 * Returns a map of code -> display name plus unresolved flag.
 * Falls back to code itself if lookup fails.
 */
async function lookupBiomarkerNames(
  codes: string[],
  institutionId: number,
  queryClient: QueryClient,
): Promise<{ lookup: Record<string, string>; hasUnresolved: boolean }> {
  const lookup: Record<string, string> = {};
  let hasUnresolved = false;
  const cacheKey = Array.from(
    new Set(codes.map((code) => normalizeBiomarkerCode(code)).filter(Boolean)),
  ).sort();
  const batch = await queryClient.fetchQuery({
    queryKey: ["biomarker-batch", cacheKey, institutionId],
    queryFn: async () => {
      const response = await fetchBiomarkerBatch(codes, institutionId);
      return normalizeBiomarkerBatchResults(response);
    },
    staleTime: 1000 * 60 * 10,
  });

  for (const code of codes) {
    const normalized = normalizeBiomarkerCode(code);
    const name = normalized ? batch[normalized]?.name ?? code : code;
    lookup[code] = name;
    if (normalized && batch[normalized] === null) {
      hasUnresolved = true;
    }
  }

  return { lookup, hasUnresolved };
}

export interface UseUrlBiomarkerSyncOptions {
  /** Current selected biomarkers */
  selected: SelectedBiomarker[];
  /** Called when biomarkers are loaded from URL */
  onLoadFromUrl: (biomarkers: SelectedBiomarker[]) => void;
  /** Whether to skip URL sync (e.g., when other params like ?template= are being processed) */
  skipSync?: boolean;
  /** Current locale for share URL generation */
  locale?: string;
}

export interface UseUrlBiomarkerSyncResult {
  /** Whether biomarkers are currently being loaded from URL */
  isLoadingFromUrl: boolean;
  /** Biomarker codes still loading names from URL */
  loadingCodes: string[];
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
  const { selected, onLoadFromUrl, skipSync = false, locale } = options;

  const { institutionId } = useInstitution();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState<string[]>([]);

  // Track whether we've done initial load from URL
  const initialLoadDoneRef = useRef(false);
  // Track last written URL to avoid loops
  const lastWrittenCodesRef = useRef<string>("");
  // Debounce timer for URL updates
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedKey = useMemo(
    () =>
      selected
        .map((entry) => entry.code.trim().toUpperCase())
        .filter((code) => code.length > 0)
        .join(","),
    [selected],
  );
  const selectedRef = useRef<SelectedBiomarker[]>(selected);
  const selectedKeyRef = useRef<string>(selectedKey);
  const onLoadFromUrlRef = useRef(onLoadFromUrl);
  const loadedCodesRef = useRef<string[]>([]);
  const loadedKeyRef = useRef<string | null>(null);
  const unresolvedCodesRef = useRef<Set<string>>(new Set());
  const lastLoadedRef = useRef<SelectedBiomarker[] | null>(null);
  const lastLookupInstitutionRef = useRef<number | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
    selectedKeyRef.current = selectedKey;
  }, [selected, selectedKey]);

  useEffect(() => {
    onLoadFromUrlRef.current = onLoadFromUrl;
  }, [onLoadFromUrl]);

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

    const urlKey = codes.join(",");

    const selectedMatchesUrl =
      selectedKeyRef.current && selectedKeyRef.current === urlKey;
    const hasUnresolvedSelection = selectedMatchesUrl
      ? selectedRef.current.some(
          (entry) =>
            entry.name.trim().toUpperCase() === entry.code.trim().toUpperCase(),
        )
      : false;
    if (selectedMatchesUrl && !hasUnresolvedSelection) {
      initialLoadDoneRef.current = true;
      lastWrittenCodesRef.current = urlKey;
      return;
    }

    // Mark as loading and populate immediate fallbacks
    setIsLoadingFromUrl(true);
    initialLoadDoneRef.current = true;
    const joinedCodes = codes.join(",");
    lastWrittenCodesRef.current = joinedCodes;
    loadedCodesRef.current = codes;
    loadedKeyRef.current = joinedCodes;
    const selectedNames = new Map(
      selectedRef.current.map((entry) => [entry.code.trim().toUpperCase(), entry.name]),
    );
    const pendingCodes = codes.filter((code) => {
      const selectedName = selectedNames.get(code);
      if (!selectedName) {
        return true;
      }
      return selectedName.trim().toUpperCase() === code;
    });
    const fallbackBiomarkers = codes.map((code) => ({
      code,
      name: selectedNames.get(code) ?? code,
    }));
    setLoadingCodes(pendingCodes);
    lastLoadedRef.current = fallbackBiomarkers;
    unresolvedCodesRef.current = new Set(pendingCodes);
    if (!selectedMatchesUrl) {
      onLoadFromUrlRef.current(fallbackBiomarkers);
    }

    let cancelled = false;

    lookupBiomarkerNames(codes, institutionId, queryClient)
      .then(({ lookup: nameMap, hasUnresolved }) => {
        if (cancelled) {
          return;
        }
        const biomarkers = codes.map((code) => ({
          code,
          name: nameMap[code] || code,
        }));
        unresolvedCodesRef.current = hasUnresolved ? new Set(codes) : new Set();
        lastLookupInstitutionRef.current = institutionId;
        const previous = lastLoadedRef.current ?? fallbackBiomarkers;
        const previousNames = new Map(
          previous.map((entry) => [entry.code.trim().toUpperCase(), entry.name]),
        );
        const hasUpdates = biomarkers.some(
          (biomarker) =>
            previousNames.get(biomarker.code.trim().toUpperCase()) !== biomarker.name,
        );
        if (hasUpdates) {
          onLoadFromUrlRef.current(biomarkers);
          lastLoadedRef.current = biomarkers;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFromUrl(false);
          setLoadingCodes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, searchParams, skipSync, hasOtherParams, queryClient]);

  useEffect(() => {
    if (!initialLoadDoneRef.current || skipSync || hasOtherParams) {
      return;
    }

    const loadedKey = loadedKeyRef.current;
    if (!loadedKey || loadedCodesRef.current.length === 0) {
      return;
    }

    if (selectedKeyRef.current !== loadedKey) {
      return;
    }

    if (lastLookupInstitutionRef.current === institutionId) {
      return;
    }

    if (unresolvedCodesRef.current.size === 0) {
      return;
    }

    let cancelled = false;
    setLoadingCodes(Array.from(unresolvedCodesRef.current));

    setIsLoadingFromUrl(true);
    lookupBiomarkerNames(loadedCodesRef.current, institutionId, queryClient)
      .then(({ lookup: nameMap, hasUnresolved }) => {
        if (cancelled) {
          return;
        }

        const biomarkers = loadedCodesRef.current.map((code) => ({
          code,
          name: nameMap[code] || code,
        }));

        unresolvedCodesRef.current = hasUnresolved
          ? new Set(loadedCodesRef.current)
          : new Set();
        lastLookupInstitutionRef.current = institutionId;

        const previous = lastLoadedRef.current ?? [];
        const previousNames = new Map(
          previous.map((entry) => [entry.code.trim().toUpperCase(), entry.name]),
        );
        const hasUpdates = biomarkers.some(
          (biomarker) =>
            previousNames.get(biomarker.code.trim().toUpperCase()) !== biomarker.name,
        );

        if (hasUpdates) {
          onLoadFromUrlRef.current(biomarkers);
          lastLoadedRef.current = biomarkers;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFromUrl(false);
          setLoadingCodes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, skipSync, hasOtherParams, queryClient]);

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
  }, [selected, searchParams, skipSync, hasOtherParams, router, locale]);

  const getShareUrl = useCallback(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const basePath =
      locale && locale !== defaultLocale ? `/${locale}` : "/";
    const baseUrl = `${window.location.origin}${basePath}`;
    const codes = selected.map((b) => b.code).join(",");
    if (!codes) {
      return baseUrl;
    }

    return `${baseUrl}?${URL_PARAM_NAME}=${encodeURIComponent(codes)}`;
  }, [locale, selected]);

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
    loadingCodes,
    getShareUrl,
    copyShareUrl,
  };
}
