"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "../../../i18n/navigation";
import { Header } from "../../../components/header";
import { TemplateModal } from "../../../components/template-modal";
import { CollectionsToolbar } from "./collections-toolbar";
import type { SortOption } from "./collections-toolbar";
import { TemplateCard, TemplateCardSkeleton } from "./template-card";
import {
  useTemplateCatalog,
  useTemplatePricing,
} from "../../../hooks/useBiomarkerListTemplates";
import { useTemplateAdmin } from "../../../hooks/useTemplateAdmin";
import { useUserSession } from "../../../hooks/useUserSession";
import { usePanelStore } from "../../../stores/panelStore";
import { track } from "../../../lib/analytics";
import { slugify } from "../../../lib/slug";
import { getTemplateDescription, getTemplateName } from "../../../lib/template-localization";
import { Button } from "../../../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../ui/dialog";

export default function CollectionsContent() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const session = useUserSession();
  const isAdmin = Boolean(session.data?.is_admin);
  const templateAdmin = useTemplateAdmin();
  const templatesQuery = useTemplateCatalog({ includeAll: isAdmin });
  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const { pricingBySlug } = useTemplatePricing(templates);
  const addMany = usePanelStore((state) => state.addMany);
  const replaceAll = usePanelStore((state) => state.replaceAll);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalNameEn, setModalNameEn] = useState("");
  const [modalNamePl, setModalNamePl] = useState("");
  const [modalSlug, setModalSlug] = useState("");
  const [modalDescriptionEn, setModalDescriptionEn] = useState("");
  const [modalDescriptionPl, setModalDescriptionPl] = useState("");
  const [modalIsActive, setModalIsActive] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalSourceSlug, setModalSourceSlug] = useState<string | null>(null);
  const [modalSlugTouched, setModalSlugTouched] = useState(false);
  const [modalBiomarkers, setModalBiomarkers] = useState<
    { code: string; display_name: string; notes: string | null }[]
  >([]);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(
    null,
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortOption>("updated");
  const [showInactive, setShowInactive] = useState(false);
  const handleClearFilters = () => {
    setSearchQuery("");
    setSortKey("updated");
    setShowInactive(false);
  };

  const openModalForTemplate = (template: (typeof templates)[number]) => {
    setModalNameEn(template.name_en);
    setModalNamePl(template.name_pl);
    setModalSlug(template.slug);
    setModalDescriptionEn(template.description_en ?? "");
    setModalDescriptionPl(template.description_pl ?? "");
    setModalIsActive(template.is_active);
    setModalSourceSlug(template.slug);
    setModalError(null);
    setModalSlugTouched(true);
    setModalBiomarkers(
      template.biomarkers.map((entry) => ({
        code: entry.code,
        display_name: entry.display_name,
        notes: entry.notes ?? null,
      })),
    );
    setAdminError(null);
    setIsModalOpen(true);
  };

  const handleModalNameEnChange = (value: string) => {
    setModalNameEn(value);
    if (!modalSlugTouched) {
      setModalSlug(slugify(value || modalNamePl));
    }
  };

  const handleModalNamePlChange = (value: string) => {
    setModalNamePl(value);
    if (!modalSlugTouched) {
      setModalSlug(slugify(modalNameEn || value));
    }
  };

  const handleModalSlugChange = (value: string) => {
    setModalSlug(value);
    setModalSlugTouched(true);
  };

  const handleModalConfirm = async () => {
    if (!modalSourceSlug) {
      return;
    }
    const trimmedNameEn = modalNameEn.trim();
    const trimmedNamePl = modalNamePl.trim();
    const normalizedSlug = slugify(modalSlug || modalNameEn || modalNamePl);
    if (!trimmedNameEn) {
      setModalError(t("errors.templateNameEnEmpty"));
      return;
    }
    if (!trimmedNamePl) {
      setModalError(t("errors.templateNamePlEmpty"));
      return;
    }
    if (!normalizedSlug) {
      setModalError(t("errors.templateSlugEmpty"));
      return;
    }

    setModalSubmitting(true);
    try {
      await templateAdmin.updateMutation.mutateAsync({
        currentSlug: modalSourceSlug,
        payload: {
          slug: normalizedSlug,
          name_en: trimmedNameEn,
          name_pl: trimmedNamePl,
          description_en: modalDescriptionEn.trim() || null,
          description_pl: modalDescriptionPl.trim() || null,
          is_active: modalIsActive,
          biomarkers: modalBiomarkers,
        },
      });
      setIsModalOpen(false);
      setModalError(null);
      setAdminError(null);
      setModalSlugTouched(false);
      setModalSourceSlug(null);
      setModalBiomarkers([]);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : t("errors.failedToUpdate"));
    } finally {
      setModalSubmitting(false);
    }
  };

  const openDeleteDialog = (slug: string, name: string) => {
    setDeleteTarget({ slug, name });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      await templateAdmin.deleteMutation.mutateAsync(deleteTarget.slug);
      setAdminError(null);
      setDeleteTarget(null);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : t("errors.failedToDelete"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleAddToPanel = (template: (typeof templates)[number]) => {
    const templateName = getTemplateName(template, locale);
    addMany(
      template.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })),
    );
    track("panel_apply_template", { mode: "append" });
    toast(t("collections.appliedAppend", { name: templateName }));
  };

  const handleReplacePanel = (template: (typeof templates)[number]) => {
    const templateName = getTemplateName(template, locale);
    replaceAll(
      template.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })),
    );
    track("panel_apply_template", { mode: "replace" });
    toast(t("collections.appliedReplace", { name: templateName }));
  };

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (!isAdmin && !template.is_active) {
        return false;
      }
      if (isAdmin && !showInactive && !template.is_active) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const localizedName = getTemplateName(template, locale);
      const localizedDescription = getTemplateDescription(template, locale) ?? "";
      const haystack = `${localizedName} ${localizedDescription}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [isAdmin, searchQuery, showInactive, templates, locale]);

  const sortedTemplates = useMemo(() => {
    const sorted = [...filteredTemplates];
    sorted.sort((a, b) => {
      if (sortKey === "count") {
        return b.biomarkers.length - a.biomarkers.length;
      }
      if (sortKey === "total") {
        const totalA = pricingBySlug[a.slug]?.totalNow;
        const totalB = pricingBySlug[b.slug]?.totalNow;
        const resolvedA = typeof totalA === "number" ? totalA : Number.POSITIVE_INFINITY;
        const resolvedB = typeof totalB === "number" ? totalB : Number.POSITIVE_INFINITY;
        return resolvedA - resolvedB;
      }
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA;
    });
    return sorted;
  }, [filteredTemplates, pricingBySlug, sortKey]);
  const hasTemplates = templates.length > 0;
  const hasResults = sortedTemplates.length > 0;

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-primary">{t("collections.title")}</h1>
        <p className="mt-2 max-w-xl text-sm text-secondary">
          {t("collections.description")}
        </p>
        {adminError && (
          <p className="mt-4 text-sm text-accent-red">{adminError}</p>
        )}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-10">
        <CollectionsToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          sortValue={sortKey}
          onSortChange={setSortKey}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          isAdmin={isAdmin}
          resultCount={sortedTemplates.length}
        />

        {templatesQuery.isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <TemplateCardSkeleton key={`template-card-skeleton-${index}`} />
            ))}
          </div>
        ) : templatesQuery.isError ? (
          <div className="rounded-panel border border-accent-red/40 bg-accent-red/10 px-4 py-6 text-sm text-accent-red">
            {t("collections.failedToLoad")}
          </div>
        ) : !hasResults ? (
          hasTemplates ? (
            <div
              className="flex flex-col items-center gap-4 rounded-panel border border-dashed border-border/80 bg-surface-1/70 px-6 py-10 text-center text-sm text-secondary"
              data-testid="collections-empty-results"
            >
              <p>{t("collections.noResults")}</p>
              <Button variant="secondary" onClick={handleClearFilters}>
                {t("collections.clearFilters")}
              </Button>
            </div>
          ) : (
            <div
              className="rounded-panel border border-dashed border-border/80 bg-surface-1/70 px-6 py-8 text-center text-sm text-secondary"
              data-testid="collections-empty-catalog"
            >
              {t("collections.noTemplates")}
            </div>
          )
        ) : (
          <div className="grid gap-4">
            {sortedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                pricing={pricingBySlug[template.slug]}
                onAddToPanel={() => handleAddToPanel(template)}
                onReplacePanel={() => handleReplacePanel(template)}
                onViewDetails={() => router.push(`/collections/${template.slug}`)}
                isAdmin={isAdmin}
                onEdit={() => openModalForTemplate(template)}
                onDelete={() =>
                  openDeleteDialog(template.slug, getTemplateName(template, locale))
                }
              />
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>{t("common.delete")}</DialogTitle>
          <DialogDescription className="mt-2">
            {t("templateModal.deleteConfirm", { name: deleteTarget?.name ?? "" })}
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t("common.cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={deleteSubmitting}
              onClick={() => void handleDeleteConfirm()}
            >
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TemplateModal
        open={isAdmin && isModalOpen}
        title={t("templateModal.editTemplate")}
        submitLabel={modalSubmitting ? t("templateModal.saving") : t("templateModal.saveChanges")}
        nameEn={modalNameEn}
        namePl={modalNamePl}
        slug={modalSlug}
        descriptionEn={modalDescriptionEn}
        descriptionPl={modalDescriptionPl}
        isActive={modalIsActive}
        error={modalError}
        isSubmitting={modalSubmitting}
        onNameEnChange={handleModalNameEnChange}
        onNamePlChange={handleModalNamePlChange}
        onSlugChange={handleModalSlugChange}
        onDescriptionEnChange={setModalDescriptionEn}
        onDescriptionPlChange={setModalDescriptionPl}
        onIsActiveChange={setModalIsActive}
        onClose={() => {
          setIsModalOpen(false);
          setModalError(null);
          setModalSlugTouched(false);
          setModalSourceSlug(null);
          setModalBiomarkers([]);
        }}
        onConfirm={handleModalConfirm}
      />
    </main>
  );
}
