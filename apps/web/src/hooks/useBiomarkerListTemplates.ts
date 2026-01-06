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

const buildOptimizationKey = (codes: string[]) =>
  codes.map((code) => code.trim().toLowerCase()).sort().join("|");

export function useTemplatePricing(templates: BiomarkerListTemplate[]) {
  const queries = useQueries({
    queries: templates.map((template) => {
      const codes = template.biomarkers.map((entry) => entry.code);
      const key = buildOptimizationKey(codes);
      return {
        queryKey: ["optimize", key, "auto", null],
        queryFn: async ({ signal }: { signal?: AbortSignal }) => {
          return postParsedJson(
            "/optimize",
            OptimizeResponseSchema,
            { biomarkers: codes, mode: "auto" },
            { signal },
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
