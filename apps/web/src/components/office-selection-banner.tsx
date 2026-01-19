"use client";

import { useTranslations } from "next-intl";

import { useAccountSettings } from "../hooks/useAccountSettings";
import { useInstitutionHydrated } from "../hooks/useInstitutionHydrated";
import { useUserSession } from "../hooks/useUserSession";
import {
  DEFAULT_INSTITUTION_ID,
  useInstitutionStore,
} from "../stores/institutionStore";
import { OfficeSelector } from "./office-selector";

export function OfficeSelectionBanner() {
  const t = useTranslations();
  const isHydrated = useInstitutionHydrated();
  const institutionId = useInstitutionStore((state) => state.institutionId);
  const hasSelectedInstitution = useInstitutionStore(
    (state) => state.hasSelectedInstitution,
  );
  const sessionQuery = useUserSession();
  const isLoggedIn = Boolean(sessionQuery.data);
  const account = useAccountSettings(isLoggedIn);
  const preferredInstitutionId =
    account.settingsQuery.data?.preferred_institution_id ?? null;
  const isAccountLoading =
    isLoggedIn &&
    (account.settingsQuery.isLoading || account.settingsQuery.isFetching);

  if (!isHydrated) return null;
  if (sessionQuery.isLoading) return null;
  if (isAccountLoading) return null;
  if (preferredInstitutionId) return null;
  if (hasSelectedInstitution) return null;
  if (institutionId !== DEFAULT_INSTITUTION_ID) return null;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">
            {t("officeBanner.title")}
          </p>
          <p className="text-xs text-secondary">{t("officeBanner.description")}</p>
        </div>
        <OfficeSelector className="self-start sm:self-auto" />
      </div>
    </div>
  );
}
