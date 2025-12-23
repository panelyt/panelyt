# Internationalization & SEO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add full bilingual Polish/English support with SEO optimization to the Panelyt web app.

**Architecture:** Polish served at root (`/`), English at `/en/...`. Uses next-intl for routing and translations. JSON translation files in `src/i18n/messages/`. Full SEO with dynamic metadata, sitemap, robots.txt, Open Graph, and JSON-LD structured data.

**Tech Stack:** Next.js 16, next-intl, TypeScript

---

## Task 1: Install next-intl

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add next-intl dependency**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web add next-intl
```

**Step 2: Verify installation**

Run:
```bash
cd /Users/egor/code/panelyt/apps/web && cat package.json | grep next-intl
```
Expected: `"next-intl": "^X.X.X"` in dependencies

**Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add next-intl dependency"
```

---

## Task 2: Create i18n configuration

**Files:**
- Create: `apps/web/src/i18n/config.ts`
- Create: `apps/web/src/i18n/request.ts`

**Step 1: Create i18n config file**

Create `apps/web/src/i18n/config.ts`:
```typescript
export const locales = ["pl", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pl";
```

**Step 2: Create request config for next-intl**

Create `apps/web/src/i18n/request.ts`:
```typescript
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { locales, defaultLocale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !hasLocale(locales, locale)) {
    locale = defaultLocale;
  }
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

**Step 3: Verify TypeScript compiles**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web typecheck
```
Expected: May show errors about missing messages files (expected, we create them next)

**Step 4: Commit**

```bash
git add apps/web/src/i18n/
git commit -m "feat(web): add i18n configuration files"
```

---

## Task 3: Create translation message files

**Files:**
- Create: `apps/web/src/i18n/messages/pl.json`
- Create: `apps/web/src/i18n/messages/en.json`

**Step 1: Create Polish translations**

Create `apps/web/src/i18n/messages/pl.json`:
```json
{
  "meta": {
    "title": "Panelyt - Optymalizator badań krwi",
    "description": "Zoptymalizuj koszt paneli badań krwi korzystając z aktualnych cen i minimów z 30 dni.",
    "templatesTitle": "Szablony | Panelyt",
    "templatesDescription": "Przeglądaj gotowe szablony badań krwi oparte na nauce.",
    "listsTitle": "Moje listy | Panelyt",
    "listsDescription": "Zarządzaj zapisanymi zestawami biomarkerów.",
    "accountTitle": "Ustawienia konta | Panelyt",
    "accountDescription": "Połącz Telegram, aby otrzymywać powiadomienia o spadkach cen."
  },
  "nav": {
    "optimizer": "Optymalizator",
    "templates": "Szablony",
    "myLists": "Moje listy",
    "account": "Konto"
  },
  "common": {
    "loading": "Ładowanie...",
    "save": "Zapisz",
    "cancel": "Anuluj",
    "delete": "Usuń",
    "edit": "Edytuj",
    "close": "Zamknij",
    "copy": "Kopiuj",
    "copied": "Skopiowano!",
    "share": "Udostępnij",
    "load": "Wczytaj",
    "biomarker": "biomarker",
    "biomarkers": "biomarkery",
    "biomarkersGenitive": "biomarkerów",
    "updated": "Zaktualizowano",
    "template": "Szablon"
  },
  "auth": {
    "signIn": "Zaloguj się",
    "signOut": "Wyloguj się",
    "signingOut": "Wylogowywanie...",
    "register": "Zarejestruj się",
    "createAccount": "Utwórz konto",
    "username": "Nazwa użytkownika",
    "usernamePlaceholder": "np. jan-kowalski",
    "usernameHint": "3-64 znaki: małe litery, cyfry, myślnik, podkreślenie.",
    "password": "Hasło",
    "passwordPlaceholder": "Minimum 8 znaków",
    "confirmPassword": "Potwierdź hasło",
    "confirmPasswordPlaceholder": "Powtórz hasło",
    "signInDescription": "Zaloguj się, aby zsynchronizować zapisane listy i powiadomienia.",
    "registerDescription": "Wybierz nazwę użytkownika i hasło, aby zabezpieczyć swoje wybory i przyszłe alerty.",
    "needAccount": "Nie masz konta? Zarejestruj się",
    "alreadyRegistered": "Masz już konto? Zaloguj się"
  },
  "home": {
    "buildPanel": "Zbuduj swój panel badań",
    "searchPlaceholder": "Szukaj biomarkerów do dodania...",
    "addToPanel": "Dodaj do panelu",
    "comparePrices": "Porównujemy ceny w różnych laboratoriach",
    "searchTip": "Wskazówka: naciśnij {key}, aby dodać pierwszy wynik.",
    "noMatches": "Brak bezpośrednich dopasowań. Spróbuj wpisać nazwę biomarkera.",
    "searching": "Szukanie...",
    "saveAsTemplate": "Zapisz jako szablon"
  },
  "results": {
    "emptyState": "Zacznij od dodania biomarkerów powyżej. Panelyt natychmiast uruchomi solver i zasugeruje najtańszą kombinację pojedynczych badań i pakietów, podświetlając bonusowe biomarkery, które otrzymasz w pakiecie.",
    "optimizing": "Obliczanie optymalnego koszyka...",
    "optimizationFailed": "Optymalizacja nie powiodła się",
    "currentTotal": "Aktualny koszt"
  },
  "lists": {
    "title": "Moje listy",
    "description": "Zarządzaj zapisanymi zestawami biomarkerów, wczytuj je do optymalizatora lub usuwaj stare wpisy.",
    "loadingLists": "Ładowanie list...",
    "noLists": "Brak list. Zbuduj selekcję na stronie głównej i naciśnij {saveButton}, aby zapisać ją tutaj.",
    "enableAllAlerts": "Włącz wszystkie alerty",
    "disableAllAlerts": "Wyłącz wszystkie alerty",
    "enableAlerts": "Włącz alerty",
    "disableAlerts": "Wyłącz alerty",
    "loadInOptimizer": "Wczytaj do optymalizatora",
    "shareLink": "Link do udostępnienia",
    "copyLink": "Kopiuj link",
    "regenerate": "Regeneruj",
    "regenerating": "Regenerowanie...",
    "disableShare": "Wyłącz udostępnianie",
    "disabling": "Wyłączanie...",
    "enableShare": "Włącz udostępnianie",
    "generating": "Generowanie...",
    "shareDescription": "Wygeneruj link do udostępnienia, aby inni mogli zobaczyć tę listę bez możliwości edycji.",
    "linkTelegramFirst": "Połącz swój czat Telegram w {link}, aby włączyć alerty.",
    "accountSettings": "Ustawienia konta"
  },
  "saveList": {
    "title": "Zapisz bieżącą selekcję",
    "description": "Nadaj tej liście nazwę, aby móc ją później wczytać lub porównać ceny.",
    "listName": "Nazwa listy",
    "listNamePlaceholder": "np. Coroczne badania",
    "saveList": "Zapisz listę"
  },
  "loadMenu": {
    "savedLists": "Zapisane listy",
    "noSavedLists": "Brak zapisanych list."
  },
  "collections": {
    "title": "Gotowe szablony",
    "description": "Zacznij od zestawów biomarkerów opartych na nauce. Wczytaj szablon do optymalizatora lub sprawdź szczegóły przed porównaniem cen.",
    "loadingTemplates": "Ładowanie szablonów...",
    "failedToLoad": "Nie udało się załadować szablonów. Spróbuj ponownie.",
    "noTemplates": "Brak opublikowanych szablonów. Sprawdź później!",
    "unpublished": "Nieopublikowany",
    "viewDetails": "Zobacz szczegóły",
    "noDescription": "Brak opisu."
  },
  "templateDetail": {
    "loadingTemplate": "Ładowanie szablonu...",
    "failedToLoad": "Nie udało się załadować szablonu.",
    "notFound": "Nie znaleźliśmy tej listy biomarkerów. Może została wycofana z publikacji.",
    "biomarkers": "Biomarkery",
    "includedMarkers": "Zawarte markery",
    "matchedBiomarker": "Dopasowany biomarker",
    "latestPricing": "Aktualne ceny",
    "pricingDescription": "Optymalizator automatycznie przelicza ceny z diag.pl. Dostosuj szablon w głównej aplikacji, aby sprawdzić alternatywy."
  },
  "sharedList": {
    "loadingList": "Ładowanie udostępnionej listy...",
    "fetchingList": "Pobieranie udostępnionej listy...",
    "notFound": "Nie można znaleźć tej udostępnionej listy.",
    "invalidLink": "Ten link do udostępnienia jest już nieważny lub został odwołany przez właściciela.",
    "sharedBiomarkers": "Udostępnione biomarkery",
    "selectionOverview": "Przegląd selekcji",
    "mappedBiomarkerId": "ID zmapowanego biomarkera",
    "livePricing": "Aktualne ceny",
    "livePricingDescription": "Panelyt oblicza najtańszy koszyk dla tej udostępnionej listy, używając najnowszych cen z diag.pl.",
    "shared": "Udostępniono"
  },
  "account": {
    "title": "Ustawienia konta",
    "description": "Połącz swój czat Telegram, aby otrzymywać alerty o spadkach cen zapisanych list.",
    "signInRequired": "Zaloguj się, aby zarządzać alertami Telegram i zapisanymi listami.",
    "telegramUnavailable": "Integracja z Telegram jest obecnie niedostępna. Spróbuj później.",
    "telegramConnection": "Połączenie z Telegram",
    "telegramDescription": "Uruchom bota w Telegram, a następnie kliknij przycisk deep-link lub wyślij komendę pokazaną poniżej. Możesz też wkleić ID czatu ręcznie, jeśli bot je poda.",
    "linkToken": "Token połączenia",
    "sendCommand": "Wyślij {command} do bota lub kliknij poniżej.",
    "copyCommand": "Kopiuj komendę",
    "openBot": "Otwórz bota",
    "expires": "Wygasa",
    "generateTokenHint": "Wygeneruj token, aby połączyć nowy czat lub odświeżyć połączenie.",
    "newLinkToken": "Nowy token",
    "generatingToken": "Generowanie...",
    "chatStatus": "Status czatu",
    "chatId": "ID czatu",
    "linkedAt": "Połączono",
    "pasteChatId": "Wklej ID czatu, aby połączyć ręcznie",
    "chatIdPlaceholder": "np. 123456789",
    "linking": "Łączenie...",
    "disconnectChat": "Rozłącz czat",
    "disconnecting": "Rozłączanie...",
    "howItWorks": "Jak to działa",
    "step1": "Kliknij link do bota lub wyszukaj bota Panelyt w Telegram i naciśnij {start}.",
    "step2": "Bot odpowie z Twoim ID czatu i komendą {link}.",
    "step3": "Użyj komendy lub wklej ID czatu powyżej, aby połączyć konto.",
    "step4": "Włącz alerty dla dowolnej zapisanej listy na stronie List. Powiadomimy Cię, gdy cena spadnie."
  },
  "templateModal": {
    "publishTemplate": "Opublikuj szablon",
    "editTemplate": "Edytuj szablon",
    "templateName": "Nazwa szablonu",
    "templateNamePlaceholder": "np. Panel tarczycowy",
    "slug": "Slug",
    "slugPlaceholder": "np. panel-tarczycowy",
    "description": "Opis",
    "descriptionPlaceholder": "Krótki opis tego szablonu...",
    "isActive": "Aktywny (widoczny publicznie)",
    "saving": "Zapisywanie...",
    "saveTemplate": "Zapisz szablon",
    "saveChanges": "Zapisz zmiany"
  },
  "errors": {
    "failedToLoad": "Nie udało się załadować. Spróbuj ponownie.",
    "failedToSave": "Nie udało się zapisać.",
    "failedToDelete": "Nie udało się usunąć.",
    "failedToUpdate": "Nie udało się zaktualizować.",
    "failedToCopy": "Nie udało się skopiować.",
    "clipboardUnavailable": "Schowek niedostępny. Skopiuj ręcznie.",
    "chatIdBlank": "ID czatu nie może być puste.",
    "failedToStoreChatId": "Nie udało się zapisać ID czatu.",
    "failedToGenerateToken": "Nie udało się wygenerować tokenu.",
    "failedToDisconnect": "Nie udało się rozłączyć czatu Telegram.",
    "failedToUpdateAlerts": "Nie udało się zaktualizować alertów Telegram.",
    "failedToShare": "Nie udało się włączyć udostępniania.",
    "failedToRegenerate": "Nie udało się zregenerować linku.",
    "failedToDisableShare": "Nie udało się wyłączyć udostępniania.",
    "failedToCalculateTotals": "Nie udało się obliczyć sum dla zapisanych list.",
    "templateNameEmpty": "Nazwa szablonu nie może być pusta.",
    "templateSlugEmpty": "Slug szablonu nie może być pusty."
  },
  "seo": {
    "siteName": "Panelyt",
    "homeOgTitle": "Panelyt - Optymalizator badań krwi",
    "homeOgDescription": "Znajdź najtańszą kombinację badań krwi. Porównuj ceny w laboratoriach i oszczędzaj."
  },
  "language": {
    "switch": "English"
  }
}
```

**Step 2: Create English translations**

Create `apps/web/src/i18n/messages/en.json`:
```json
{
  "meta": {
    "title": "Panelyt - Blood Test Optimizer",
    "description": "Optimize blood test panel costs using current prices and 30-day minimums.",
    "templatesTitle": "Templates | Panelyt",
    "templatesDescription": "Browse science-backed blood test templates.",
    "listsTitle": "My Lists | Panelyt",
    "listsDescription": "Manage your saved biomarker sets.",
    "accountTitle": "Account Settings | Panelyt",
    "accountDescription": "Connect Telegram to receive price drop notifications."
  },
  "nav": {
    "optimizer": "Optimizer",
    "templates": "Templates",
    "myLists": "My Lists",
    "account": "Account"
  },
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "copy": "Copy",
    "copied": "Copied!",
    "share": "Share",
    "load": "Load",
    "biomarker": "biomarker",
    "biomarkers": "biomarkers",
    "biomarkersGenitive": "biomarkers",
    "updated": "Updated",
    "template": "Template"
  },
  "auth": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "signingOut": "Signing out...",
    "register": "Register",
    "createAccount": "Create account",
    "username": "Username",
    "usernamePlaceholder": "e.g. panelyt-user",
    "usernameHint": "3-64 characters: lowercase letters, digits, hyphen, underscore.",
    "password": "Password",
    "passwordPlaceholder": "Minimum 8 characters",
    "confirmPassword": "Confirm password",
    "confirmPasswordPlaceholder": "Repeat your password",
    "signInDescription": "Enter your credentials to sync saved lists and notifications.",
    "registerDescription": "Pick a username and password to secure your selections and future alerts.",
    "needAccount": "Need an account? Register instead",
    "alreadyRegistered": "Already registered? Sign in"
  },
  "home": {
    "buildPanel": "Build your test panel",
    "searchPlaceholder": "Search biomarkers to add...",
    "addToPanel": "Add to panel",
    "comparePrices": "We compare prices across labs",
    "searchTip": "Tip: press {key} to add the top match instantly.",
    "noMatches": "No direct matches yet. Try typing the biomarker name.",
    "searching": "Searching...",
    "saveAsTemplate": "Save as template"
  },
  "results": {
    "emptyState": "Start by adding biomarkers above. Panelyt will run the solver instantly and suggest the cheapest combination of single tests and packages, highlighting any bonus biomarkers you pick up along the way.",
    "optimizing": "Crunching the optimal basket...",
    "optimizationFailed": "Optimization failed",
    "currentTotal": "Current total"
  },
  "lists": {
    "title": "My Lists",
    "description": "Manage every saved biomarker set, load it into the optimizer, or clean up old entries.",
    "loadingLists": "Loading lists...",
    "noLists": "No lists yet. Build a selection on the home page and press {saveButton} to store it here.",
    "enableAllAlerts": "Enable all alerts",
    "disableAllAlerts": "Disable all alerts",
    "enableAlerts": "Enable alerts",
    "disableAlerts": "Disable alerts",
    "loadInOptimizer": "Load in optimizer",
    "shareLink": "Share link",
    "copyLink": "Copy link",
    "regenerate": "Regenerate",
    "regenerating": "Regenerating...",
    "disableShare": "Disable share",
    "disabling": "Disabling...",
    "enableShare": "Enable share",
    "generating": "Generating...",
    "shareDescription": "Generate a shareable link to let others view this list without editing rights.",
    "linkTelegramFirst": "Link your Telegram chat in {link} before enabling alerts.",
    "accountSettings": "Account settings"
  },
  "saveList": {
    "title": "Save current selection",
    "description": "Give this set a name so you can reload it or compare prices later.",
    "listName": "List name",
    "listNamePlaceholder": "e.g. Annual checkup",
    "saveList": "Save list"
  },
  "loadMenu": {
    "savedLists": "Saved lists",
    "noSavedLists": "No saved lists yet."
  },
  "collections": {
    "title": "Curated Templates",
    "description": "Start with science-backed biomarker bundles. Load a template into the optimizer or inspect the details before running price comparisons.",
    "loadingTemplates": "Loading curated templates...",
    "failedToLoad": "Failed to load templates. Please try again.",
    "noTemplates": "No templates published yet. Check back soon!",
    "unpublished": "Unpublished",
    "viewDetails": "View details",
    "noDescription": "No description provided."
  },
  "templateDetail": {
    "loadingTemplate": "Loading template...",
    "failedToLoad": "Failed to load template.",
    "notFound": "We couldn't find that biomarker list. It may have been unpublished.",
    "biomarkers": "Biomarkers",
    "includedMarkers": "Included markers",
    "matchedBiomarker": "Matched biomarker",
    "latestPricing": "Latest pricing",
    "pricingDescription": "The optimizer runs automatically against diag.pl prices. Adjust the template in the main app to explore alternatives."
  },
  "sharedList": {
    "loadingList": "Loading shared list...",
    "fetchingList": "Fetching shared list...",
    "notFound": "Unable to find this shared list.",
    "invalidLink": "This share link is no longer valid or has been revoked by its owner.",
    "sharedBiomarkers": "Shared biomarkers",
    "selectionOverview": "Selection overview",
    "mappedBiomarkerId": "Mapped biomarker ID",
    "livePricing": "Live pricing",
    "livePricingDescription": "Panelyt computes the cheapest basket for this shared list using the latest diag.pl prices.",
    "shared": "Shared"
  },
  "account": {
    "title": "Account Settings",
    "description": "Link your Telegram chat to receive alerts when any saved list gets cheaper.",
    "signInRequired": "Sign in to manage Telegram alerts and saved lists.",
    "telegramUnavailable": "Telegram integration is currently unavailable. Try again later.",
    "telegramConnection": "Telegram connection",
    "telegramDescription": "Start the bot in Telegram, then either tap the deep-link button or send the command shown below. You can also paste the chat ID manually if the bot replies with it.",
    "linkToken": "Link token",
    "sendCommand": "Send {command} to the bot or tap below.",
    "copyCommand": "Copy command",
    "openBot": "Open bot",
    "expires": "Expires",
    "generateTokenHint": "Generate a token to link a new chat or refresh the connection.",
    "newLinkToken": "New link token",
    "generatingToken": "Generating...",
    "chatStatus": "Chat status",
    "chatId": "Chat ID",
    "linkedAt": "Linked at",
    "pasteChatId": "Paste chat ID to link manually",
    "chatIdPlaceholder": "e.g. 123456789",
    "linking": "Linking...",
    "disconnectChat": "Disconnect chat",
    "disconnecting": "Disconnecting...",
    "howItWorks": "How it works",
    "step1": "Tap the bot link or search for your Panelyt bot in Telegram and press {start}.",
    "step2": "The bot replies with your chat ID and the {link} command.",
    "step3": "Either use the command or paste the chat ID above to connect your account.",
    "step4": "Enable alerts on any saved list from the Lists page. We will ping you when the price drops."
  },
  "templateModal": {
    "publishTemplate": "Publish curated template",
    "editTemplate": "Edit template",
    "templateName": "Template name",
    "templateNamePlaceholder": "e.g. Thyroid Panel",
    "slug": "Slug",
    "slugPlaceholder": "e.g. thyroid-panel",
    "description": "Description",
    "descriptionPlaceholder": "Short description of this template...",
    "isActive": "Active (publicly visible)",
    "saving": "Saving...",
    "saveTemplate": "Save template",
    "saveChanges": "Save changes"
  },
  "errors": {
    "failedToLoad": "Failed to load. Please try again.",
    "failedToSave": "Failed to save.",
    "failedToDelete": "Failed to delete.",
    "failedToUpdate": "Failed to update.",
    "failedToCopy": "Failed to copy.",
    "clipboardUnavailable": "Clipboard is unavailable. Copy the token manually.",
    "chatIdBlank": "Chat ID cannot be blank.",
    "failedToStoreChatId": "Failed to store chat ID.",
    "failedToGenerateToken": "Failed to generate link token.",
    "failedToDisconnect": "Unable to disconnect Telegram chat.",
    "failedToUpdateAlerts": "Failed to update Telegram alerts.",
    "failedToShare": "Failed to enable sharing.",
    "failedToRegenerate": "Failed to regenerate share link.",
    "failedToDisableShare": "Failed to disable sharing.",
    "failedToCalculateTotals": "Failed to calculate totals for saved lists.",
    "templateNameEmpty": "Template name cannot be empty.",
    "templateSlugEmpty": "Template slug cannot be empty."
  },
  "seo": {
    "siteName": "Panelyt",
    "homeOgTitle": "Panelyt - Blood Test Optimizer",
    "homeOgDescription": "Find the cheapest blood test combination. Compare prices across labs and save money."
  },
  "language": {
    "switch": "Polski"
  }
}
```

**Step 3: Verify JSON is valid**

Run:
```bash
cd /Users/egor/code/panelyt/apps/web && node -e "require('./src/i18n/messages/pl.json'); require('./src/i18n/messages/en.json'); console.log('JSON valid')"
```
Expected: `JSON valid`

**Step 4: Commit**

```bash
git add apps/web/src/i18n/messages/
git commit -m "feat(web): add Polish and English translation files"
```

---

## Task 4: Configure next-intl plugin in Next.js config

**Files:**
- Modify: `apps/web/next.config.ts`

**Step 1: Update next.config.ts**

Replace contents of `apps/web/next.config.ts` with:
```typescript
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@panelyt/types"],
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
};

export default withNextIntl(nextConfig);
```

**Step 2: Verify build starts**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web build
```
Expected: Build starts (may fail on other issues, but should parse config)

**Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(web): configure next-intl plugin"
```

---

## Task 5: Add locale routing middleware

**Files:**
- Create: `apps/web/src/middleware.ts`

**Step 1: Create middleware**

Create `apps/web/src/middleware.ts`:
```typescript
import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web typecheck
```
Expected: No errors from middleware.ts

**Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): add i18n routing middleware"
```

---

## Task 6: Restructure app routes with locale segment

**Files:**
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Move pages into `[locale]` folder

**Step 1: Create locale layout**

Create `apps/web/src/app/[locale]/layout.tsx`:
```typescript
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { locales } from "../../i18n/config";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return children;
}
```

**Step 2: Move page.tsx to [locale] folder**

Run:
```bash
mkdir -p /Users/egor/code/panelyt/apps/web/src/app/\[locale\]
mv /Users/egor/code/panelyt/apps/web/src/app/page.tsx /Users/egor/code/panelyt/apps/web/src/app/\[locale\]/page.tsx
```

**Step 3: Move collections folder**

Run:
```bash
mv /Users/egor/code/panelyt/apps/web/src/app/collections /Users/egor/code/panelyt/apps/web/src/app/\[locale\]/collections
```

**Step 4: Move lists folder**

Run:
```bash
mv /Users/egor/code/panelyt/apps/web/src/app/lists /Users/egor/code/panelyt/apps/web/src/app/\[locale\]/lists
```

**Step 5: Move account folder**

Run:
```bash
mv /Users/egor/code/panelyt/apps/web/src/app/account /Users/egor/code/panelyt/apps/web/src/app/\[locale\]/account
```

**Step 6: Verify folder structure**

Run:
```bash
ls -la /Users/egor/code/panelyt/apps/web/src/app/\[locale\]/
```
Expected: layout.tsx, page.tsx, collections/, lists/, account/

**Step 7: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): restructure routes with locale segment"
```

---

## Task 7: Update root layout for i18n

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Update root layout**

Replace contents of `apps/web/src/app/layout.tsx` with:
```typescript
import Script from "next/script";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panelyt",
  description: "Optimize blood test panels using current and 30-day minimum prices.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === "production";
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {isProduction ? (
          <Script
            src="https://analytics.panelyt.com/script.js"
            data-website-id="e8071713-1cf1-44c7-8674-909d128c9507"
            strategy="afterInteractive"
          />
        ) : null}
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): update root layout with NextIntlClientProvider"
```

---

## Task 8: Create language switcher component

**Files:**
- Create: `apps/web/src/components/language-switcher.tsx`

**Step 1: Create the component**

Create `apps/web/src/components/language-switcher.tsx`:
```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("language");

  const otherLocale = locale === "pl" ? "en" : "pl";

  // Build path for other locale
  let otherPath: string;
  if (locale === "pl") {
    // Currently Polish (no prefix), add /en prefix
    otherPath = `/en${pathname}`;
  } else {
    // Currently English (/en prefix), remove it
    otherPath = pathname.replace(/^\/en/, "") || "/";
  }

  return (
    <Link
      href={otherPath}
      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
    >
      {t("switch")}
    </Link>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/language-switcher.tsx
git commit -m "feat(web): add language switcher component"
```

---

## Task 9: Update Header component with translations

**Files:**
- Modify: `apps/web/src/components/header.tsx`

**Step 1: Add translations to Header**

This is a larger change. Update `apps/web/src/components/header.tsx` to:
1. Import `useTranslations` from `next-intl`
2. Import and use `LanguageSwitcher`
3. Replace hardcoded strings with `t()` calls
4. Update nav links to include locale-aware paths

The key changes:
- Add `const t = useTranslations();`
- Replace `"Optimizer"` with `t("nav.optimizer")`
- Replace `"Templates"` with `t("nav.templates")`
- Replace `"My Lists"` with `t("nav.myLists")`
- Replace `"Sign in"` with `t("auth.signIn")`
- Replace `"Sign out"` with `t("auth.signOut")`
- Replace `"Signing out..."` with `t("auth.signingOut")`
- Replace `"Register"` with `t("auth.register")`
- Add `<LanguageSwitcher />` next to auth buttons

**Step 2: Verify component compiles**

Run:
```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/components/header.tsx
git commit -m "feat(web): add i18n to Header component"
```

---

## Task 10: Update remaining components with translations

Update these components one by one, replacing hardcoded strings with translation keys:

**Components to update:**
1. `auth-modal.tsx` - auth strings
2. `save-list-modal.tsx` - saveList strings
3. `search-box.tsx` - home strings
4. `load-menu.tsx` - loadMenu strings
5. `selected-biomarkers.tsx` - common strings
6. `template-modal.tsx` - templateModal strings
7. `optimization-results/index.tsx` - results strings

For each component:
1. Import `useTranslations` from `next-intl`
2. Add `const t = useTranslations("namespace");`
3. Replace hardcoded strings
4. Run typecheck
5. Commit

---

## Task 11: Update page components with translations

Update page files:
1. `[locale]/page.tsx` - home page
2. `[locale]/collections/page.tsx` - collections page
3. `[locale]/collections/[slug]/page.tsx` - template detail
4. `[locale]/collections/shared/[shareToken]/page.tsx` - shared list
5. `[locale]/lists/page.tsx` - lists page
6. `[locale]/account/page.tsx` - account page

For each page:
1. Import `useTranslations`
2. Replace hardcoded strings
3. Run typecheck
4. Commit

---

## Task 12: Add generateMetadata to pages for SEO

**Files:**
- Modify all page files to add `generateMetadata`

For each page, add a `generateMetadata` function that:
1. Gets translations via `getTranslations`
2. Returns localized title and description
3. Adds `alternates` with hreflang links

Example for home page:
```typescript
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: locale === "pl" ? "/" : "/en",
      languages: {
        pl: "/",
        en: "/en",
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale: locale === "pl" ? "pl_PL" : "en_US",
      alternateLocale: locale === "pl" ? "en_US" : "pl_PL",
    },
  };
}
```

---

## Task 13: Add sitemap.ts

**Files:**
- Create: `apps/web/src/app/sitemap.ts`

**Step 1: Create sitemap**

Create `apps/web/src/app/sitemap.ts`:
```typescript
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://panelyt.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    { path: "/", priority: 1.0 },
    { path: "/collections", priority: 0.8 },
    { path: "/lists", priority: 0.6 },
    { path: "/account", priority: 0.4 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  // Add static routes for both locales
  for (const route of staticRoutes) {
    // Polish (default, no prefix)
    entries.push({
      url: `${BASE_URL}${route.path}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
        },
      },
    });

    // English
    entries.push({
      url: `${BASE_URL}/en${route.path}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
        },
      },
    });
  }

  // TODO: Fetch dynamic template slugs from API and add them

  return entries;
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/sitemap.ts
git commit -m "feat(web): add sitemap with bilingual URLs"
```

---

## Task 14: Add robots.ts

**Files:**
- Create: `apps/web/src/app/robots.ts`

**Step 1: Create robots.ts**

Create `apps/web/src/app/robots.ts`:
```typescript
import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://panelyt.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/robots.ts
git commit -m "feat(web): add robots.txt"
```

---

## Task 15: Add JSON-LD structured data to home page

**Files:**
- Modify: `apps/web/src/app/[locale]/page.tsx`

Add JSON-LD WebSite schema to the home page:

```typescript
// In the page component, add:
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Panelyt",
  url: "https://panelyt.com",
  description: t("meta.description"),
  inLanguage: locale === "pl" ? "pl-PL" : "en-US",
};

// In the JSX, add before closing </main>:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

---

## Task 16: Final verification and cleanup

**Step 1: Run full typecheck**

```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web typecheck
```

**Step 2: Run linter**

```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web lint
```

**Step 3: Run tests**

```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web test:run
```

**Step 4: Test dev server**

```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web dev
```

Verify:
- `/` shows Polish content
- `/en` shows English content
- Language switcher works
- All pages load in both languages
- SEO meta tags are correct per language

**Step 5: Build for production**

```bash
cd /Users/egor/code/panelyt && pnpm --filter @panelyt/web build
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(web): complete i18n and SEO implementation"
```

---

## Summary

Total tasks: 16
Files created: ~10
Files modified: ~25

Key deliverables:
- Full Polish/English bilingual support
- SEO-optimized with hreflang, sitemap, robots.txt
- Open Graph meta tags per language
- JSON-LD structured data
- Language switcher in header
