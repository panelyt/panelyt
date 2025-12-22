"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  open: boolean;
  mode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
  onClose: () => void;
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
  onRegister: (credentials: { username: string; password: string }) => Promise<void>;
  isLoggingIn: boolean;
  isRegistering: boolean;
  error: string | null;
}

export function AuthModal({
  open,
  mode,
  onModeChange,
  onClose,
  onLogin,
  onRegister,
  isLoggingIn,
  isRegistering,
  error,
}: Props) {
  const t = useTranslations();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setConfirmPassword("");
    }
  }, [open, mode]);

  if (!open) {
    return null;
  }

  const isSubmitting = mode === "login" ? isLoggingIn : isRegistering;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = username.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 64) {
      return;
    }
    if (password.length < 8 || password.length > 128) {
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      return;
    }

    const payload = { username: normalized, password };
    if (mode === "login") {
      await onLogin(payload);
    } else {
      await onRegister(payload);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 text-slate-100 shadow-2xl shadow-slate-900/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-700/70 bg-slate-900/70 p-1 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="Close auth dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Panelyt</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {mode === "login"
            ? t("auth.signInDescription")
            : t("auth.registerDescription")}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="auth-username" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("auth.username")}
            </label>
            <input
              id="auth-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("auth.usernamePlaceholder")}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <p className="mt-1 text-[11px] text-slate-500">{t("auth.usernameHint")}</p>
          </div>

          <div>
            <label htmlFor="auth-password" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("auth.password")}
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="auth-confirm" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("auth.confirmPassword")}
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t("auth.confirmPasswordPlaceholder")}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          {mode === "login" ? (
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className="text-emerald-300 underline-offset-4 transition hover:text-emerald-200 hover:underline"
            >
              {t("auth.needAccount")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className="text-emerald-300 underline-offset-4 transition hover:text-emerald-200 hover:underline"
            >
              {t("auth.alreadyRegistered")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
