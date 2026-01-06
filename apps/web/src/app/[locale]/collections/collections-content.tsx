"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "../../../i18n/navigation";
import { Header } from "../../../components/header";
import { TemplateModal } from "../../../components/template-modal";
import { TemplatePriceSummary } from "../../../components/template-price-summary";
import {
  useTemplateCatalog,
  useTemplatePricing,
} from "../../../hooks/useBiomarkerListTemplates";
import { useTemplateAdmin } from "../../../hooks/useTemplateAdmin";
import { useUserSession } from "../../../hooks/useUserSession";
import { usePanelStore } from "../../../stores/panelStore";
import { slugify } from "../../../lib/slug";
import { Button, buttonVariants } from "../../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import { IconButton } from "../../../ui/icon-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../ui/table";
import { cn } from "../../../lib/cn";

const sortOptions = [
  { value: "updated", labelKey: "collections.sortUpdated" },
  { value: "count", labelKey: "collections.sortCount" },
  { value: "total", labelKey: "collections.sortTotal" },
] as const;

type SortOption = (typeof sortOptions)[number]["value"];

export default function CollectionsContent() {
  const t = useTranslations();
  const locale = useLocale();
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
  const [modalName, setModalName] = useState("");
  const [modalSlug, setModalSlug] = useState("");
  const [modalDescription, setModalDescription] = useState("");
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
  const [expandedSlugs, setExpandedSlugs] = useState<string[]>([]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
      }),
    [locale],
  );

  const openModalForTemplate = (template: (typeof templates)[number]) => {
    setModalName(template.name);
    setModalSlug(template.slug);
    setModalDescription(template.description ?? "");
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

  const handleModalNameChange = (value: string) => {
    setModalName(value);
    if (!modalSlugTouched) {
      setModalSlug(slugify(value));
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
    const trimmedName = modalName.trim();
    const normalizedSlug = slugify(modalSlug || modalName);
    if (!trimmedName) {
      setModalError(t("errors.templateNameEmpty"));
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
          name: trimmedName,
          description: modalDescription.trim() || null,
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
    addMany(
      template.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })),
    );
  };

  const handleReplacePanel = (template: (typeof templates)[number]) => {
    replaceAll(
      template.biomarkers.map((entry) => ({
        code: entry.code,
        name: entry.display_name,
      })),
    );
  };

  const toggleExpanded = (slug: string) => {
    setExpandedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((value) => value !== slug) : [...prev, slug],
    );
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
      const haystack = `${template.name} ${template.description ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [isAdmin, searchQuery, showInactive, templates]);

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

  const formatUpdatedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return dateFormatter.format(date);
  };

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
        <div className="flex flex-col gap-4 rounded-panel border border-border/70 bg-surface-1/60 p-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label
              htmlFor="template-search"
              className="text-xs font-semibold uppercase tracking-wide text-secondary"
            >
              {t("collections.searchLabel")}
            </label>
            <input
              id="template-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("collections.searchPlaceholder")}
              className="mt-2 w-full rounded-lg border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label
                htmlFor="template-sort"
                className="text-xs font-semibold uppercase tracking-wide text-secondary"
              >
                {t("collections.sortLabel")}
              </label>
              <select
                id="template-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortOption)}
                className="mt-2 w-full rounded-lg border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary focus-ring"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin ? (
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                  className="h-4 w-4 accent-accent-cyan"
                />
                {t("collections.showInactive")}
              </label>
            ) : null}
          </div>
        </div>

        {templatesQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-panel border border-border/70 bg-surface-1 px-4 py-6 text-sm text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("collections.loadingTemplates")}
          </div>
        ) : templatesQuery.isError ? (
          <div className="rounded-panel border border-accent-red/40 bg-accent-red/10 px-4 py-6 text-sm text-accent-red">
            {t("collections.failedToLoad")}
          </div>
        ) : sortedTemplates.length === 0 ? (
          <div className="rounded-panel border border-dashed border-border/80 bg-surface-1/70 px-6 py-8 text-center text-sm text-secondary">
            {t("collections.noTemplates")}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("collections.columnName")}</TableHead>
                    <TableHead>{t("collections.columnBiomarkers")}</TableHead>
                    <TableHead>{t("collections.columnUpdated")}</TableHead>
                    <TableHead>{t("collections.columnTotal")}</TableHead>
                    <TableHead className="text-right">
                      {t("collections.columnActions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTemplates.map((template) => {
                    const isExpanded = expandedSlugs.includes(template.slug);
                    const detailsId = `template-${template.slug}-details`;
                    const preview = template.biomarkers.slice(0, 10);
                    const remaining = template.biomarkers.length - preview.length;
                    return (
                      <Fragment key={template.id}>
                        <TableRow>
                          <TableCell className="align-top">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <h3 className="text-base font-semibold text-primary">
                                  {template.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                  {!template.is_active ? (
                                    <span className="rounded-pill border border-border/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                                      {t("collections.unpublished")}
                                    </span>
                                  ) : null}
                                  <IconButton
                                    variant="secondary"
                                    size="icon"
                                    aria-label={
                                      isExpanded
                                        ? t("collections.collapseRow")
                                        : t("collections.expandRow")
                                    }
                                    aria-expanded={isExpanded}
                                    aria-controls={detailsId}
                                    onClick={() => toggleExpanded(template.slug)}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                    )}
                                  </IconButton>
                                </div>
                              </div>
                              <p className="text-sm text-secondary">
                                {template.description ?? t("collections.noDescription")}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-secondary">
                            {t("common.biomarkersCount", {
                              count: template.biomarkers.length,
                            })}
                          </TableCell>
                          <TableCell className="text-xs text-secondary">
                            {formatUpdatedAt(template.updated_at)}
                          </TableCell>
                          <TableCell>
                            <TemplatePriceSummary
                              pricing={pricingBySlug[template.slug]}
                              className="text-base"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleAddToPanel(template)}
                              >
                                {t("collections.addToPanel")}
                              </Button>
                              <Link
                                href={`/collections/${template.slug}`}
                                className={cn(
                                  buttonVariants({ variant: "secondary", size: "sm" }),
                                  "inline-flex",
                                )}
                              >
                                {t("collections.viewDetails")}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                              {isAdmin ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <IconButton
                                      variant="secondary"
                                      size="icon"
                                      aria-label={t("collections.adminMenu")}
                                    >
                                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                    </IconButton>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={() => openModalForTemplate(template)}
                                    >
                                      {t("common.edit")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        openDeleteDialog(template.slug, template.name)
                                      }
                                      className="text-accent-red"
                                    >
                                      {t("common.delete")}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className="bg-surface-2/30">
                            <TableCell colSpan={5}>
                              <div id={detailsId} className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  {preview.map((entry) => (
                                    <span
                                      key={entry.code}
                                      className="inline-flex items-center gap-2 rounded-pill border border-border/70 bg-surface-2 px-3 py-1 text-xs"
                                    >
                                      <span className="font-medium text-primary">
                                        {entry.display_name}
                                      </span>
                                      <span className="font-mono text-secondary">
                                        {entry.code}
                                      </span>
                                    </span>
                                  ))}
                                  {remaining > 0 ? (
                                    <span className="text-xs text-secondary">
                                      {t("collections.moreBiomarkers", { count: remaining })}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddToPanel(template)}
                                  >
                                    {t("collections.addToPanel")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleReplacePanel(template)}
                                  >
                                    {t("collections.replacePanel")}
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 md:hidden">
              {sortedTemplates.map((template) => {
                const isExpanded = expandedSlugs.includes(template.slug);
                const preview = template.biomarkers.slice(0, 10);
                const remaining = template.biomarkers.length - preview.length;
                return (
                  <div
                    key={template.id}
                    className="rounded-panel border border-border/70 bg-surface-1 px-5 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-primary">
                          {template.name}
                        </h3>
                        <p className="mt-1 text-sm text-secondary">
                          {template.description ?? t("collections.noDescription")}
                        </p>
                      </div>
                      <TemplatePriceSummary
                        pricing={pricingBySlug[template.slug]}
                        className="text-xl"
                      />
                    </div>
                    <p className="mt-3 text-xs text-secondary">
                      {t("common.biomarkersCount", { count: template.biomarkers.length })}
                      {" · "}
                      {t("collections.updatedLabel", {
                        date: formatUpdatedAt(template.updated_at),
                      })}
                    </p>
                    {!template.is_active ? (
                      <span className="mt-2 inline-flex rounded-pill border border-border/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
                        {t("collections.unpublished")}
                      </span>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => handleAddToPanel(template)}>
                        {t("collections.addToPanel")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleExpanded(template.slug)}
                      >
                        {isExpanded
                          ? t("collections.collapseRow")
                          : t("collections.expandRow")}
                      </Button>
                      <Link
                        href={`/collections/${template.slug}`}
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "sm" }),
                          "inline-flex",
                        )}
                      >
                        {t("collections.viewDetails")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {isAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant="secondary"
                              size="icon"
                              aria-label={t("collections.adminMenu")}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openModalForTemplate(template)}>
                              {t("common.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => openDeleteDialog(template.slug, template.name)}
                              className="text-accent-red"
                            >
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    {isExpanded ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {preview.map((entry) => (
                            <span
                              key={entry.code}
                              className="inline-flex items-center gap-2 rounded-pill border border-border/70 bg-surface-2 px-3 py-1 text-xs"
                            >
                              <span className="font-medium text-primary">
                                {entry.display_name}
                              </span>
                              <span className="font-mono text-secondary">
                                {entry.code}
                              </span>
                            </span>
                          ))}
                          {remaining > 0 ? (
                            <span className="text-xs text-secondary">
                              {t("collections.moreBiomarkers", { count: remaining })}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReplacePanel(template)}
                          >
                            {t("collections.replacePanel")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
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
        name={modalName}
        slug={modalSlug}
        description={modalDescription}
        isActive={modalIsActive}
        error={modalError}
        isSubmitting={modalSubmitting}
        onNameChange={handleModalNameChange}
        onSlugChange={handleModalSlugChange}
        onDescriptionChange={setModalDescription}
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
