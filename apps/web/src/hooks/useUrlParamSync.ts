"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BiomarkerListTemplateSchema,
  SavedListSchema,
  type SavedList,
} from "@panelyt/types";

import { getJson, HttpError } from "../lib/http";

export interface SelectedBiomarker {
  code: string;
  name: string;
}

export interface UseUrlParamSyncOptions {
  /** Called when a template is loaded from URL */
  onLoadTemplate: (biomarkers: SelectedBiomarker[]) => void;
  /** Called when a shared list is loaded from URL */
  onLoadShared: (biomarkers: SelectedBiomarker[]) => void;
  /** Called when a user's saved list is loaded from URL */
  onLoadList: (list: SavedList) => void;
  /** Called when an error occurs */
  onError: (message: string) => void;
  /** User's saved lists (for ?list= param matching) */
  savedLists: SavedList[];
  /** Whether saved lists are still loading */
  isFetchingSavedLists: boolean;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.body) {
      try {
        const parsed = JSON.parse(err.body);
        if (typeof parsed.detail === "string") {
          return parsed.detail;
        }
      } catch {
        // ignore parse failures
      }
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Something went wrong";
}

/**
 * Syncs URL query parameters to load templates, shared lists, or user lists.
 * Cleans up the URL after loading.
 */
export function useUrlParamSync(options: UseUrlParamSyncOptions): void {
  const {
    onLoadTemplate,
    onLoadShared,
    onLoadList,
    onError,
    savedLists,
    isFetchingSavedLists,
  } = options;

  const router = useRouter();

  // Handle ?template= parameter
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const templateSlug = params.get("template");
    if (!templateSlug) {
      return;
    }

    let cancelled = false;

    const loadTemplate = async () => {
      try {
        const payload = await getJson(`/biomarker-lists/templates/${templateSlug}`);
        const template = BiomarkerListTemplateSchema.parse(payload);
        if (cancelled) {
          return;
        }
        onLoadTemplate(
          template.biomarkers.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          onError(extractErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          params.delete("template");
          const query = params.toString();
          router.replace(query ? `/?${query}` : "/", { scroll: false });
        }
      }
    };

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [router, onLoadTemplate, onError]);

  // Handle ?shared= parameter
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get("shared");
    if (!sharedToken) {
      return;
    }

    let cancelled = false;

    const loadShared = async () => {
      try {
        const payload = await getJson(`/biomarker-lists/shared/${sharedToken}`);
        const sharedList = SavedListSchema.parse(payload);
        if (cancelled) {
          return;
        }
        onLoadShared(
          sharedList.biomarkers.map((entry) => ({
            code: entry.code,
            name: entry.display_name,
          })),
        );
      } catch (err) {
        if (!cancelled) {
          onError(extractErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          params.delete("shared");
          const query = params.toString();
          router.replace(query ? `/?${query}` : "/", { scroll: false });
        }
      }
    };

    void loadShared();

    return () => {
      cancelled = true;
    };
  }, [router, onLoadShared, onError]);

  // Handle ?list= parameter (requires savedLists to be loaded first)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const listId = params.get("list");
    if (!listId) {
      return;
    }
    if (isFetchingSavedLists) {
      return;
    }
    const match = savedLists.find((item) => item.id === listId);
    if (match) {
      onLoadList(match);
    }
    params.delete("list");
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }, [savedLists, isFetchingSavedLists, onLoadList, router]);
}
