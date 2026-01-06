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
import { toast } from "sonner";

import { Header } from "../../../components/header";
import { useAccountSettings } from "../../../hooks/useAccountSettings";
import { useUserSession } from "../../../hooks/useUserSession";
import { track } from "../../../lib/analytics";
import { cn } from "../../../lib/cn";
import { Button, buttonVariants } from "../../../ui/button";

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
      toast(t("toast.telegramCommandCopied"));
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

  const handleOpenBot = () => {
    track("telegram_link_opened");
    toast(t("toast.telegramBotOpened"));
  };

  const linkUrl = telegram?.link_url ?? (telegram?.bot_username && telegram.link_token
    ? `https://t.me/${telegram.bot_username}?start=${telegram.link_token}`
    : null);

  return (
    <main className="min-h-screen bg-app text-primary">
      <Header />

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-semibold text-primary">{t("account.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-secondary">
          {t("account.description")}
        </p>
        {mutationError && (
          <p className="mt-4 text-sm text-accent-red">{mutationError}</p>
        )}
      </div>

      <section className="mx-auto flex max-w-5xl flex-col gap-4 px-6 pb-10">
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-panel border border-border/70 bg-surface-1 px-4 py-6 text-sm text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
          </div>
        ) : !session.data ? (
          <div className="rounded-panel border border-border/70 bg-surface-1/70 px-6 py-8 text-center text-sm text-secondary">
            {t("account.signInRequired")}
          </div>
        ) : !telegram ? (
          <div className="rounded-panel border border-border/70 bg-surface-1/70 px-6 py-8 text-center text-sm text-secondary">
            {t("account.telegramUnavailable")}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-panel border border-accent-cyan/40 bg-surface-1/80 px-6 py-6">
              <div className="flex items-center gap-3 text-accent-cyan">
                <PlugZap className="h-5 w-5" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-primary">
                  {t("account.telegramConnection")}
                </h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-secondary">
                {t("account.telegramDescription")}
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-panel border border-border/70 bg-surface-2/60 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />{" "}
                    {t("account.linkToken")}
                  </h3>
                  {telegram.link_token ? (
                    <>
                      <p className="mt-2 text-sm text-secondary">
                        {t.rich("account.sendCommand", {
                          command: () => (
                            <span className="font-mono text-accent-emerald">
                              /link {telegram.link_token}
                            </span>
                          ),
                        })}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopyToken(telegram.link_token ?? "")}
                        >
                          {copiedToken ? (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {t("account.copyCommand")}
                        </Button>
                        {linkUrl && (
                          <a
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleOpenBot}
                            className={cn(
                              buttonVariants({ variant: "secondary", size: "sm" }),
                              "gap-2",
                            )}
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("account.openBot")}
                          </a>
                        )}
                      </div>
                      <p className="mt-3 text-xs text-secondary">
                        {t("account.expires")} {formatDate(telegram.link_token_expires_at)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-secondary">
                      {t("account.generateTokenHint")}
                    </p>
                  )}
                  <Button
                    type="button"
                    onClick={handleGenerateToken}
                    size="sm"
                    loading={account.linkTokenMutation.isPending}
                    className="mt-4"
                  >
                    {account.linkTokenMutation.isPending ? null : (
                      <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    )}
                    {account.linkTokenMutation.isPending ? t("account.generatingToken") : t("account.newLinkToken")}
                  </Button>
                </div>

                <div className="rounded-panel border border-border/70 bg-surface-2/60 px-5 py-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                    <Unplug className="h-4 w-4" aria-hidden="true" />{" "}
                    {t("account.chatStatus")}
                  </h3>
                  <dl className="mt-3 space-y-2 text-xs text-secondary">
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary">{t("account.chatId")}</dt>
                      <dd className="font-mono text-primary">{telegram.chat_id ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary">{t("account.linkedAt")}</dt>
                      <dd>{formatDate(telegram.linked_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-col gap-3">
                    <form onSubmit={handleManualLink} className="flex flex-col gap-2">
                      <label
                        className="text-xs font-semibold uppercase tracking-wide text-secondary"
                        htmlFor="chat-id"
                      >
                        {t("account.pasteChatId")}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="chat-id"
                          name="chat-id"
                          value={chatIdInput}
                          onChange={(event) => setChatIdInput(event.target.value)}
                          placeholder={t("account.chatIdPlaceholder")}
                          className="w-full rounded-lg border border-border/80 bg-surface-2 px-3 py-2 text-sm text-primary placeholder:text-secondary focus-ring"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          loading={account.manualLinkMutation.isPending}
                        >
                          {account.manualLinkMutation.isPending
                            ? t("account.linking")
                            : t("common.save")}
                        </Button>
                      </div>
                    </form>
                    <Button
                      type="button"
                      onClick={handleDisconnect}
                      variant="destructive"
                      size="sm"
                      loading={account.unlinkMutation.isPending}
                    >
                      {account.unlinkMutation.isPending ? null : (
                        <Unplug className="h-4 w-4" aria-hidden="true" />
                      )}
                      {account.unlinkMutation.isPending
                        ? t("account.disconnecting")
                        : t("account.disconnectChat")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-panel border border-dashed border-border/80 bg-surface-1/60 px-6 py-5 text-sm text-secondary">
              <h3 className="text-sm font-semibold text-primary">
                {t("account.howItWorks")}
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-secondary">
                <li>
                  {t.rich("account.step1", {
                    start: (chunks) => (
                      <span className="font-semibold text-accent-emerald">{chunks}</span>
                    ),
                  })}
                </li>
                <li>
                  {t.rich("account.step2", {
                    link: (chunks) => (
                      <span className="font-mono text-accent-emerald">{chunks}</span>
                    ),
                  })}
                </li>
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
