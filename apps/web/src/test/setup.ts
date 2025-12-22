import '@testing-library/jest-dom'

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

  const Link = React.forwardRef(({ href, ...rest }: any, ref) =>
    React.createElement('a', { ...rest, href: toPath(href), ref }),
  )
  Link.displayName = 'MockLink'

  return {
    Link,
    usePathname: () => '/',
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

// Mock fetch for tests
global.fetch = vi.fn()

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})
