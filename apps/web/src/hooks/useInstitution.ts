"use client";

import { useCallback, useEffect } from "react";

import { useAccountSettings } from "./useAccountSettings";
import { useUserSession } from "./useUserSession";
import {
  type InstitutionSelection,
  useInstitutionStore,
} from "../stores/institutionStore";

export function useInstitution() {
  const institutionId = useInstitutionStore((state) => state.institutionId);
  const label = useInstitutionStore((state) => state.label);
  const setInstitutionState = useInstitutionStore((state) => state.setInstitution);

  const session = useUserSession();
  const account = useAccountSettings(Boolean(session.data));

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
