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

export function useInstitution() {
  const institutionId = useInstitutionStore((state) => state.institutionId);
  const label = useInstitutionStore((state) => state.label);
  const hasSelectedInstitution = useInstitutionStore(
    (state) => state.hasSelectedInstitution,
  );
  const setInstitutionState = useInstitutionStore((state) => state.setInstitution);
  const clearOptimizationSummary = usePanelStore((state) => state.clearOptimizationSummary);
  const lastInstitutionIdRef = useRef<number | null>(null);
  const hasSyncedSelectionRef = useRef(false);

  const session = useUserSession();
  const account = useAccountSettings(Boolean(session.data));
  const queryClient = useQueryClient();

  const preferredId = account.settingsQuery.data?.preferred_institution_id ?? null;
  const preferredLabel =
    account.settingsQuery.data?.preferred_institution_label ?? null;

  useEffect(() => {
    if (!preferredId) {
      return;
    }

    if (preferredId === institutionId && preferredLabel === label) {
      return;
    }

    setInstitutionState({ id: preferredId, label: preferredLabel });
  }, [institutionId, label, preferredId, preferredLabel, setInstitutionState]);

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
  }, [clearOptimizationSummary, institutionId, queryClient]);

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
