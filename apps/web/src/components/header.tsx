"use client";

import { useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "../i18n/navigation";

import { useUserSession } from "../hooks/useUserSession";
import { useAuthModal } from "../hooks/useAuthModal";
import { AuthModal } from "./auth-modal";
import { LanguageSwitcher } from "./language-switcher";
import { PanelTray } from "../features/panel/PanelTray";
import { AUTH_REQUIRED_EVENT } from "../lib/auth-events";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface HeaderProps {
  onAuthSuccess?: () => void;
  onLogoutError?: (error: string) => void;
}

export function Header({ onAuthSuccess, onLogoutError }: HeaderProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const sessionQuery = useUserSession();
  const userSession = sessionQuery.data;

  const authModal = useAuthModal({
    onAuthSuccess,
    onLogoutError,
  });

  useEffect(() => {
    const handleAuthRequired = () => {
      authModal.open("login");
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    };
  }, [authModal]);

  const navItems = [
    { href: "/", label: t("nav.optimizer") },
    { href: "/collections", label: t("nav.templates") },
    { href: "/lists", label: t("nav.myLists") },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-white">
                PANELYT
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive(item.href)
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <PanelTray />
            <LanguageSwitcher />
            {sessionQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            ) : userSession?.registered ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      pathname === "/account"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }`}
                  >
                    {userSession.username}
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem]">
                  <DropdownMenuItem asChild>
                    <Link href="/account">{t("nav.account")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void authModal.handleLogout()}
                    disabled={authModal.isLoggingOut}
                    className="text-red-300 focus:text-red-200"
                  >
                    {authModal.isLoggingOut ? t("auth.signingOut") : t("auth.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => authModal.open("login")}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
                >
                  {t("auth.signIn")}
                </button>
                <button
                  type="button"
                  onClick={() => authModal.open("register")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                >
                  {t("auth.register")}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-800/50 px-6 py-2 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <AuthModal
        open={authModal.isOpen}
        mode={authModal.mode}
        onModeChange={authModal.setMode}
        onClose={authModal.close}
        onLogin={authModal.handleLogin}
        onRegister={authModal.handleRegister}
        isLoggingIn={authModal.isLoggingIn}
        isRegistering={authModal.isRegistering}
        error={authModal.error}
      />
    </>
  );
}
