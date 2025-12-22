# Internationalization & SEO Design

## Overview

Add full bilingual support (Polish/English) with SEO optimization for the Panelyt web application.

## Decisions

| Aspect | Decision |
|--------|----------|
| Routing | Polish at `/`, English at `/en/...` |
| Library | next-intl |
| Translations | JSON files in `src/i18n/messages/` |
| Scope | UI strings only (API data unchanged) |
| SEO | Full: meta tags, hreflang, sitemap, robots.txt, Open Graph, JSON-LD |
| Language switcher | Header, simple PL/EN toggle |

## Route Structure

**After implementation:**
```
/                           → Polish home (default)
/collections                → Polish templates
/collections/[slug]         → Polish template detail
/collections/shared/[token] → Polish shared list
/lists                      → Polish saved lists
/account                    → Polish account settings

/en                         → English home
/en/collections             → English templates
/en/collections/[slug]      → English template detail
/en/collections/shared/[token] → English shared list
/en/lists                   → English saved lists
/en/account                 → English account settings
```

## File Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Polish home (/)
│   │   ├── collections/            # Polish routes
│   │   │   ├── page.tsx
│   │   │   ├── [slug]/page.tsx
│   │   │   └── shared/[shareToken]/page.tsx
│   │   ├── lists/page.tsx
│   │   ├── account/page.tsx
│   │   ├── sitemap.ts              # Dynamic sitemap
│   │   ├── robots.ts               # robots.txt
│   │   │
│   │   └── en/                     # English routes (mirrors structure)
│   │       ├── layout.tsx          # Sets locale="en"
│   │       ├── page.tsx
│   │       ├── collections/
│   │       │   ├── page.tsx
│   │       │   ├── [slug]/page.tsx
│   │       │   └── shared/[shareToken]/page.tsx
│   │       ├── lists/page.tsx
│   │       └── account/page.tsx
│   │
│   ├── i18n/
│   │   ├── config.ts               # Locale settings
│   │   ├── request.ts              # next-intl getRequestConfig
│   │   └── messages/
│   │       ├── pl.json             # Polish translations
│   │       └── en.json             # English translations
│   │
│   ├── middleware.ts               # Locale detection/routing
│   │
│   └── components/
│       └── language-switcher.tsx   # PL/EN toggle
```

## Translation JSON Structure

```json
{
  "common": {
    "loading": "...",
    "error": "...",
    "save": "...",
    "cancel": "...",
    "search": "...",
    "close": "..."
  },
  "nav": {
    "optimizer": "...",
    "templates": "...",
    "myLists": "...",
    "account": "..."
  },
  "home": {
    "title": "...",
    "description": "...",
    "searchPlaceholder": "...",
    "selectedBiomarkers": "...",
    "optimize": "...",
    "noSelection": "..."
  },
  "results": {
    "bestPrice": "...",
    "current": "...",
    "minimum30d": "...",
    "savings": "..."
  },
  "auth": {
    "signIn": "...",
    "signOut": "...",
    "telegramConnect": "..."
  },
  "meta": {
    "title": "...",
    "description": "..."
  }
}
```

## Middleware Configuration

```ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['pl', 'en'],
  defaultLocale: 'pl',
  localePrefix: 'as-needed'  // No prefix for Polish, /en for English
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
};
```

**Behaviors:**
- `/` serves Polish directly (no redirect)
- `/en/...` serves English
- Unknown locales redirect to Polish
- API routes bypass middleware

## SEO Implementation

### Meta Tags

Each page implements `generateMetadata()`:
- Translated `title` and `description`
- `hreflang` alternates linking both language versions
- Canonical URLs

### Sitemap

`app/sitemap.ts` generates URLs for:
- All static routes in both languages
- Dynamic collection pages (fetches slugs from API)

### robots.txt

`app/robots.ts`:
- Allow all crawlers
- Reference sitemap location

### Open Graph

- `og:title`, `og:description` (translated)
- `og:locale` (pl_PL or en_US)
- `og:locale:alternate` for other language
- `og:url` with canonical

### Structured Data (JSON-LD)

- `WebSite` schema on homepage
- `BreadcrumbList` on collection pages
- `Product` schema potential for pricing results

## Language Switcher

Header component, next to auth controls:
- Shows current language (PL/EN)
- Preserves path and query params when switching
- Simple text link (not dropdown)

## Implementation Scope

**Changes required:**
1. Add `next-intl` dependency
2. Create `src/i18n/` infrastructure
3. Add `middleware.ts`
4. Add `/en` route structure
5. Update components to use `useTranslations()`
6. Add `generateMetadata()` to all pages
7. Add `sitemap.ts`, `robots.ts`
8. Add language switcher to header
9. Add Open Graph and JSON-LD

**Files affected:** ~25-30 files

**Out of scope:**
- Backend API changes
- Translating biomarker/lab names (API data)
- Additional languages beyond PL/EN
