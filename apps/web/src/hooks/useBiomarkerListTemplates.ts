"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  BiomarkerListTemplateCollectionSchema,
  BiomarkerListTemplateSchema,
  type BiomarkerListTemplate,
  OptimizeResponseSchema,
  type OptimizeResponse,
} from "@panelyt/types";

import { getParsedJson, postParsedJson } from "../lib/http";
import { buildOptimizationKey } from "../lib/optimization";
import { useInstitution } from "./useInstitution";

const TEMPLATE_PRICING_CONCURRENCY = 4;

type LimitedQueueEntry = {
  start: () => void;
  signal?: AbortSignal;
  started: boolean;
  cancelled: boolean;
};

let activeTemplatePricing = 0;
const templatePricingQueue: LimitedQueueEntry[] = [];

function drainTemplatePricingQueue() {
  while (
    templatePricingQueue.length > 0 &&
    activeTemplatePricing < TEMPLATE_PRICING_CONCURRENCY
  ) {
    const entry = templatePricingQueue.shift();
    if (!entry) {
      return;
    }
    if (entry.cancelled || entry.signal?.aborted) {
      entry.cancelled = true;
      continue;
    }
    entry.start();
  }
}

function runTemplatePricingLimited<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abortError =
      typeof DOMException === "undefined"
        ? new Error("Aborted")
        : new DOMException("Aborted", "AbortError");
    const entry: LimitedQueueEntry = {
      start: () => {
        if (entry.cancelled || signal?.aborted) {
          entry.cancelled = true;
          reject(abortError);
          return;
        }
        entry.started = true;
        signal?.removeEventListener("abort", onAbort);
        activeTemplatePricing += 1;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            activeTemplatePricing = Math.max(0, activeTemplatePricing - 1);
            drainTemplatePricingQueue();
          });
      },
      signal,
      started: false,
      cancelled: false,
    };

    const onAbort = () => {
      if (entry.started || entry.cancelled) {
        return;
      }
      entry.cancelled = true;
      const index = templatePricingQueue.indexOf(entry);
      if (index >= 0) {
        templatePricingQueue.splice(index, 1);
      }
      reject(abortError);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    if (activeTemplatePricing < TEMPLATE_PRICING_CONCURRENCY) {
      entry.start();
    } else {
      templatePricingQueue.push(entry);
    }
  });
}

export function useTemplateCatalog(options: { includeAll?: boolean } = {}) {
  const includeAll = Boolean(options.includeAll);
  return useQuery<BiomarkerListTemplate[], Error>({
    queryKey: ["biomarker-list", "templates", includeAll],
    queryFn: async () => {
      const endpoint = includeAll
        ? "/biomarker-lists/admin/templates"
        : "/biomarker-lists/templates";
      const parsed = await getParsedJson(endpoint, BiomarkerListTemplateCollectionSchema);
      return parsed.templates;
    },
  });
}

export function useTemplateDetail(slug: string, enabled = true) {
  return useQuery<BiomarkerListTemplate, Error>({
    queryKey: ["biomarker-list", "template", slug],
    enabled,
    queryFn: async () => {
      return getParsedJson(
        `/biomarker-lists/templates/${slug}`,
        BiomarkerListTemplateSchema,
      );
    },
  });
}

export type TemplatePricingState = {
  status: "idle" | "loading" | "error" | "success";
  totalNow?: number;
};

export function useTemplatePricing(templates: BiomarkerListTemplate[]) {
  const { institutionId } = useInstitution();
  const queries = useQueries({
    queries: templates.map((template) => {
      const codes = template.biomarkers.map((entry) => entry.code);
      const key = buildOptimizationKey(codes);
      return {
        queryKey: ["optimize", key, "auto", institutionId],
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
          return runTemplatePricingLimited(
            () =>
              postParsedJson(
                `/optimize?institution=${institutionId}`,
                OptimizeResponseSchema,
                { biomarkers: codes, mode: "auto" },
                { signal },
              ),
            signal,
          );
        },
        enabled: codes.length > 0,
      };
    }),
  });

  return useMemo(() => {
    const pricingBySlug: Record<string, TemplatePricingState> = {};
    templates.forEach((template, index) => {
      const result = queries[index];
      if (!result) {
        return;
      }
      const status: TemplatePricingState["status"] = result.isError
        ? "error"
        : result.isLoading
          ? "loading"
          : result.data
            ? "success"
            : "idle";
      pricingBySlug[template.slug] = {
        status,
        totalNow: (result.data as OptimizeResponse | undefined)?.total_now,
      };
    });
    return { pricingBySlug };
  }, [queries, templates]);
}
