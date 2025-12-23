"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCcw,
  Unplug,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Header } from "../../../components/header";
import { useAccountSettings } from "../../../hooks/useAccountSettings";
import { useUserSession } from "../../../hooks/useUserSession";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pl-PL");
  } catch {
    return value;
  }
}

export default function AccountContent() {
  const t = useTranslations();
  const session = useUserSession();
  const account = useAccountSettings(Boolean(session.data));
  const [chatIdInput, setChatIdInput] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);
  const settings = account.settingsQuery.data;
  const telegram = settings?.telegram;
  const isLoading = account.settingsQuery.isLoading || session.isLoading;
  const [formError, setFormError] = useState<string | null>(null);

  const mutationError = useMemo(() => {
    return (
      formError ||
      account.linkTokenMutation.error?.message ||
      account.manualLinkMutation.error?.message ||
      account.unlinkMutation.error?.message ||
      account.settingsQuery.error?.message ||
      null
    );
  }, [
    formError,
    account.linkTokenMutation.error,
    account.manualLinkMutation.error,
    account.unlinkMutation.error,
    account.settingsQuery.error,
  ]);

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`/link ${token}`);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      setFormError(t("errors.clipboardUnavailable"));
    }
  };

  const handleManualLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = chatIdInput.trim();
    if (!trimmed) {
      setFormError(t("errors.chatIdBlank"));
      return;
    }
    setFormError(null);
    try {
      await account.manualLinkMutation.mutateAsync(trimmed);
      setChatIdInput("");
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError(t("errors.failedToStoreChatId"));
      }
    }
  };

  const handleGenerateToken = async () => {
    setFormError(null);
    try {
      await account.linkTokenMutation.mutateAsync();
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError(t("errors.failedToGenerateToken"));
      }
    }
  };

  const handleDisconnect = async () => {
    setFormError(null);
    try {
      await account.unlinkMutation.mutateAsync();
    } catch (error) {
      if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError(t("errors.failedToDisconnect"));
      }
    }
  };

  const linkUrl = telegram?.link_url ?? (telegram?.bot_username && telegram.link_token
    ? `https://t.me/${telegram.bot_username}?start=${telegram.link_token}`
    : null);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-white">{t("account.title")}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {t("account.description")}
        </p>
        {mutationError && <p className="mt-4 text-sm text-red-300">{mutationError}</p>}
      </div>

      <section className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pb-10">
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-6 text-sm text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
          </div>
        ) : !session.data ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-8 text-center text-sm text-slate-300">
            {t("account.signInRequired")}
          </div>
        ) : !telegram ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-8 text-center text-sm text-slate-300">
            {t("account.telegramUnavailable")}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-6">
              <div className="flex items-center gap-3 text-sky-200">
                <PlugZap className="h-5 w-5" />
                <h2 className="text-lg font-semibold">{t("account.telegramConnection")}</h2>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {t("account.telegramDescription")}
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <RefreshCcw className="h-4 w-4" /> {t("account.linkToken")}
                  </h3>
                  {telegram.link_token ? (
                    <>
                      <p className="mt-2 text-xs text-slate-300">
                        {t.rich("account.sendCommand", { command: () => <span className="font-mono text-emerald-200">/link {telegram.link_token}</span> })}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyToken(telegram.link_token ?? "")}
                          className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
                        >
                          {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {t("account.copyCommand")}
                        </button>
                        {linkUrl && (
                          <a
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> {t("account.openBot")}
                          </a>
                        )}
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">
                        {t("account.expires")} {formatDate(telegram.link_token_expires_at)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">
                      {t("account.generateTokenHint")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateToken}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={account.linkTokenMutation.isPending}
                  >
                    {account.linkTokenMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    {account.linkTokenMutation.isPending ? t("account.generatingToken") : t("account.newLinkToken")}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Unplug className="h-4 w-4" /> {t("account.chatStatus")}
                  </h3>
                  <dl className="mt-3 space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">{t("account.chatId")}</dt>
                      <dd className="font-mono text-slate-100">{telegram.chat_id ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">{t("account.linkedAt")}</dt>
                      <dd>{formatDate(telegram.linked_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-col gap-3">
                    <form onSubmit={handleManualLink} className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-slate-400" htmlFor="chat-id">
                        {t("account.pasteChatId")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="chat-id"
                          name="chat-id"
                          value={chatIdInput}
                          onChange={(event) => setChatIdInput(event.target.value)}
                          placeholder={t("account.chatIdPlaceholder")}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-sky-500/60 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={account.manualLinkMutation.isPending}
                        >
                          {account.manualLinkMutation.isPending ? t("account.linking") : t("common.save")}
                        </button>
                      </div>
                    </form>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/60 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={account.unlinkMutation.isPending}
                    >
                      {account.unlinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unplug className="h-4 w-4" />
                      )}
                      {account.unlinkMutation.isPending ? t("account.disconnecting") : t("account.disconnectChat")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 px-6 py-5 text-sm text-slate-300">
              <h3 className="text-sm font-semibold text-slate-200">{t("account.howItWorks")}</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-slate-300">
                <li>{t.rich("account.step1", { start: (chunks) => <span className="font-semibold text-emerald-200">{chunks}</span> })}</li>
                <li>{t.rich("account.step2", { link: (chunks) => <span className="font-mono text-emerald-200">{chunks}</span> })}</li>
                <li>{t("account.step3")}</li>
                <li>{t("account.step4")}</li>
              </ol>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
