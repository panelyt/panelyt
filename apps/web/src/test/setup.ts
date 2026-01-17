import '@testing-library/jest-dom'

import { server } from "./msw";

vi.mock('../i18n/navigation', async () => {
  const React = await import('react')

  const toPath = (href: any) => {
    if (typeof href === 'string') {
      return href
    }
    if (!href || typeof href !== 'object') {
      return '/'
    }
    const pathname = href.pathname ?? '/'
    if (!href.query) {
      return pathname
    }
    const params = new URLSearchParams(
      Object.entries(href.query).map(([key, value]) => [key, String(value)]),
    )
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  const Link = React.forwardRef(({ href, locale, ...rest }: any, ref) => {
    const path = toPath(href)
    const localizedPath = !locale || locale === 'pl' ? path : `/${locale}${path}`
    return React.createElement('a', {
      ...rest,
      href: localizedPath,
      ref,
      'data-locale': locale,
    })
  })
  Link.displayName = 'MockLink'

  return {
    Link,
    usePathname: vi.fn(() => '/'),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    getPathname: ({ href, locale }: { href: string; locale?: string }) => {
      const path = toPath(href)
      if (!locale || locale === 'pl') {
        return path
      }
      return `/${locale}${path}`
    },
  }
})

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/'),
}))

process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

const jsdomCustomEvent = typeof window !== 'undefined' ? window.CustomEvent : undefined

const syncCustomEvent = () => {
  if (!jsdomCustomEvent || typeof window === 'undefined') {
    return
  }

  // Ensure CustomEvent instances pass jsdom's Event checks (Radix focus-scope).
  if (window.CustomEvent !== jsdomCustomEvent) {
    window.CustomEvent = jsdomCustomEvent
  }
  if (globalThis.CustomEvent !== jsdomCustomEvent) {
    globalThis.CustomEvent = jsdomCustomEvent
  }
}

syncCustomEvent()

// Clean up after each test
afterEach(async () => {
  vi.clearAllMocks()
  server.resetHandlers();
  syncCustomEvent()
  await new Promise((resolve) => setTimeout(resolve, 0))
})

afterAll(() => {
  server.close();
});
