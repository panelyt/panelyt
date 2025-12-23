"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "../../../i18n/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Header } from "../../../components/header";
import { TemplateModal } from "../../../components/template-modal";
import { TemplatePriceSummary } from "../../../components/template-price-summary";
import { useTemplateCatalog } from "../../../hooks/useBiomarkerListTemplates";
import { useTemplateAdmin } from "../../../hooks/useTemplateAdmin";
import { useUserSession } from "../../../hooks/useUserSession";
import { slugify } from "../../../lib/slug";

export default function CollectionsContent() {
  const t = useTranslations();
  const router = useRouter();
  const session = useUserSession();
  const isAdmin = Boolean(session.data?.is_admin);
  const templateAdmin = useTemplateAdmin();
  const templatesQuery = useTemplateCatalog({ includeAll: isAdmin });
  const templates = templatesQuery.data ?? [];
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
      }))
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

  const handleDeleteTemplate = async (slug: string, name: string) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("templateModal.deleteConfirm", { name }));
      if (!confirmed) {
        return;
      }
    }
    try {
      await templateAdmin.deleteMutation.mutateAsync(slug);
      setAdminError(null);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : t("errors.failedToDelete"));
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-white">{t("collections.title")}</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          {t("collections.description")}
        </p>
        {adminError && (
          <p className="mt-4 text-sm text-red-300">{adminError}</p>
        )}
      </div>

      <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 pb-10">
        {templatesQuery.isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("collections.loadingTemplates")}
          </div>
        ) : templatesQuery.isError ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            {t("collections.failedToLoad")}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/70 px-6 py-8 text-center text-sm text-slate-400">
            {t("collections.noTemplates")}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`flex h-full flex-col justify-between gap-4 rounded-2xl border px-6 py-5 shadow-lg shadow-slate-900/30 ${
                  template.is_active ? "border-slate-800 bg-slate-900/80" : "border-slate-700 bg-slate-900/60"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
                        {t("common.template")}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">{template.name}</h2>
                    </div>
                    <TemplatePriceSummary
                      codes={template.biomarkers.map((entry) => entry.code)}
                    />
                  </div>
                  <p className="text-sm text-slate-300">{template.description ?? t("collections.noDescription")}</p>
                  <p className="text-xs text-slate-500">
                    {t("common.biomarkersCount", { count: template.biomarkers.length })} • {t("common.updated")} {new Date(template.updated_at).toLocaleDateString()}
                    {!template.is_active && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                        {t("collections.unpublished")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/?template=${template.slug}`)}
                    className="flex items-center gap-2 rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                  >
                    {t("lists.loadInOptimizer")}
                  </button>
                  <Link
                    href={`/collections/${template.slug}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
                  >
                    {t("collections.viewDetails")} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => openModalForTemplate(template)}
                        className="rounded-lg border border-sky-500/60 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTemplate(template.slug, template.name)}
                        className="rounded-lg border border-red-500/60 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                      >
                        {t("common.delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
