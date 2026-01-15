"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAccountSettings } from "./useAccountSettings";
import { useUserSession } from "./useUserSession";
import {
  type InstitutionSelection,
  useInstitutionStore,
} from "../stores/institutionStore";
import { usePanelStore } from "../stores/panelStore";
import {
  fetchBiomarkerBatch,
  normalizeBiomarkerBatchResults,
  normalizeBiomarkerCode,
} from "../lib/biomarkers";

export function useInstitution() {
  const institutionId = useInstitutionStore((state) => state.institutionId);
  const label = useInstitutionStore((state) => state.label);
  const hasSelectedInstitution = useInstitutionStore(
    (state) => state.hasSelectedInstitution,
  );
  const setInstitutionState = useInstitutionStore((state) => state.setInstitution);
  const clearOptimizationSummary = usePanelStore((state) => state.clearOptimizationSummary);
  const selectedBiomarkers = usePanelStore((state) => state.selected);
  const lastInstitutionIdRef = useRef<number | null>(null);
  const hasSyncedSelectionRef = useRef(false);

  const session = useUserSession();
  const account = useAccountSettings(Boolean(session.data));
  const queryClient = useQueryClient();

  const preferredId = account.settingsQuery.data?.preferred_institution_id ?? null;
  const preferredLabel =
    account.settingsQuery.data?.preferred_institution_label ?? null;
  const isUpdatingPreference = Boolean(account.updateSettingsMutation.isPending);

  useEffect(() => {
    if (!preferredId) {
      return;
    }

    if (isUpdatingPreference) {
      return;
    }

    if (preferredId === institutionId && preferredLabel === label) {
      return;
    }

    setInstitutionState({ id: preferredId, label: preferredLabel });
  }, [
    institutionId,
    isUpdatingPreference,
    label,
    preferredId,
    preferredLabel,
    setInstitutionState,
  ]);

  useEffect(() => {
    if (!session.data) {
      hasSyncedSelectionRef.current = false;
      return;
    }
    if (!account.settingsQuery.data) {
      return;
    }
    if (preferredId !== null) {
      return;
    }
    if (!hasSelectedInstitution) {
      return;
    }
    if (hasSyncedSelectionRef.current) {
      return;
    }
    hasSyncedSelectionRef.current = true;
    account.updateSettingsMutation.mutate({
      preferred_institution_id: institutionId,
    });
  }, [
    account.settingsQuery.data,
    account.updateSettingsMutation,
    hasSelectedInstitution,
    institutionId,
    preferredId,
    session.data,
  ]);

  useEffect(() => {
    if (lastInstitutionIdRef.current === null) {
      lastInstitutionIdRef.current = institutionId;
      return;
    }
    if (lastInstitutionIdRef.current === institutionId) {
      return;
    }
    lastInstitutionIdRef.current = institutionId;
    clearOptimizationSummary();
    queryClient.invalidateQueries({ queryKey: ["optimize"] });
    queryClient.invalidateQueries({ queryKey: ["optimize-addons"] });

    const codes = selectedBiomarkers
      .map((biomarker) => biomarker.code.trim())
      .filter(Boolean);
    const cacheKey = Array.from(
      new Set(codes.map((code) => normalizeBiomarkerCode(code)).filter(Boolean)),
    ).sort();
    if (codes.length > 0) {
      void queryClient.prefetchQuery({
        queryKey: ["biomarker-batch", cacheKey, institutionId],
        queryFn: async () => {
          const response = await fetchBiomarkerBatch(codes, institutionId);
          return normalizeBiomarkerBatchResults(response);
        },
        staleTime: 1000 * 60 * 10,
      });
    }
  }, [clearOptimizationSummary, institutionId, queryClient, selectedBiomarkers]);

  const setInstitution = useCallback(
    (selection: InstitutionSelection) => {
      if (selection.id === institutionId && selection.label === label) {
        return;
      }

      setInstitutionState(selection);

      if (session.data) {
        account.updateSettingsMutation.mutate({
          preferred_institution_id: selection.id,
        });
      }
    },
    [
      account.updateSettingsMutation,
      institutionId,
      label,
      session.data,
      setInstitutionState,
    ],
  );

  return {
    institutionId,
    label,
    setInstitution,
  };
}
