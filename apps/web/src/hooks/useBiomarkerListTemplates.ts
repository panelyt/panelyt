"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BiomarkerListTemplateCollectionSchema,
  BiomarkerListTemplateSchema,
  type BiomarkerListTemplate,
} from "@/lib/types";

import { getParsedJson } from "../lib/http";

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
