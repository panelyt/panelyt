"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BiomarkerListTemplateSchema,
  BiomarkerListTemplateUpsertSchema,
  type BiomarkerListTemplate,
  type BiomarkerListTemplateUpsert,
} from "@/lib/types";

import { deleteRequest, postJson, putJson } from "../lib/http";

interface UpdateTemplateInput {
  currentSlug: string;
  payload: BiomarkerListTemplateUpsert;
}

export function useTemplateAdmin() {
  const queryClient = useQueryClient();
  const templateQueryKey = ["biomarker-list", "templates"] as const;

  const createMutation = useMutation<
    BiomarkerListTemplate,
    Error,
    BiomarkerListTemplateUpsert
  >({
    mutationFn: async (payload) => {
      const parsed = BiomarkerListTemplateUpsertSchema.parse(payload);
      const response = await postJson("/biomarker-lists/admin/templates", parsed);
      return BiomarkerListTemplateSchema.parse(response);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: templateQueryKey, exact: false });
      queryClient.invalidateQueries({
        queryKey: ["biomarker-list", "template", result.slug],
      });
    },
  });

  const updateMutation = useMutation<
    BiomarkerListTemplate,
    Error,
    UpdateTemplateInput
  >({
    mutationFn: async ({ currentSlug, payload }) => {
      const parsed = BiomarkerListTemplateUpsertSchema.parse(payload);
      const response = await putJson(
        `/biomarker-lists/admin/templates/${currentSlug}`,
        parsed,
      );
      return BiomarkerListTemplateSchema.parse(response);
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: templateQueryKey, exact: false });
      queryClient.invalidateQueries({
        queryKey: ["biomarker-list", "template", variables.currentSlug],
      });
      queryClient.invalidateQueries({
        queryKey: ["biomarker-list", "template", result.slug],
      });
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (slug) => {
      await deleteRequest(`/biomarker-lists/admin/templates/${slug}`);
    },
    onSuccess: (_, slug) => {
      queryClient.invalidateQueries({ queryKey: templateQueryKey, exact: false });
      queryClient.invalidateQueries({
        queryKey: ["biomarker-list", "template", slug],
      });
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
