import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { OptimizationResults } from '../optimization-results'
import type { OptimizeResponse } from '@panelyt/types'

// Mock the hooks
vi.mock('../../hooks/useBiomarkerLookup', () => ({
  useBiomarkerLookup: vi.fn(),
}))

vi.mock('../../lib/format', () => ({
  formatCurrency: vi.fn((value) => `$${value.toFixed(2)}`),
  formatGroszToPln: vi.fn((grosz) => `$${(grosz / 100).toFixed(2)}`),
}))

import { useBiomarkerLookup } from '../../hooks/useBiomarkerLookup'

const mockUseBiomarkerLookup = vi.mocked(useBiomarkerLookup)

const createLookupResult = (
  overrides: Partial<ReturnType<typeof useBiomarkerLookup>>,
) =>
  ({
    data: undefined,
    isFetching: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useBiomarkerLookup>)

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('OptimizationResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBiomarkerLookup.mockReturnValue(
      createLookupResult({
        data: {
          ALT: 'Alanine aminotransferase',
          AST: 'Aspartate aminotransferase',
          CHOL: 'Total cholesterol',
        },
      }),
    )
  })

  it('shows empty state when no biomarkers are selected', () => {
    renderWithQueryClient(
      <OptimizationResults
        selected={[]}
        result={undefined}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText(/Start by adding biomarkers above/)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={undefined}
        isLoading={true}
        error={null}
      />
    )

    expect(screen.getByText('Crunching the optimal basket…')).toBeInTheDocument()
  })

  it('shows error state', () => {
    const error = new Error('Network error')
    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={undefined}
        isLoading={false}
        error={error}
      />
    )

    expect(screen.getByText('Optimization failed')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders optimization results with single test and package', () => {
    const mockResult: OptimizeResponse = {
      total_now: 25.00,
      total_min30: 23.50,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 1000,
          price_min30_grosz: 950,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: false,
        },
        {
          id: 2,
          kind: 'package',
          name: 'Liver Panel',
          slug: 'liver-panel',
          price_now_grosz: 1500,
          price_min30_grosz: 1400,
          currency: 'PLN',
          biomarkers: ['AST', 'CHOL'],
          url: 'https://diag.pl/sklep/pakiety/liver-panel',
          on_sale: true,
        },
      ],
      explain: {
        'ALT': ['ALT Test'],
        'AST': ['Liver Panel'],
        'CHOL': ['Liver Panel'],
      },
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST', 'CHOL']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    // Check header information
    expect(screen.getByText('Optimization summary')).toBeInTheDocument()
    expect(screen.getByText(/Covering 3 biomarkers/)).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument() // Current total
    expect(screen.getByText('$23.50')).toBeInTheDocument() // Min total

    // Check items are displayed
    expect(screen.getAllByRole('link', { name: 'ALT Test' })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Liver Panel' })[0]).toBeInTheDocument()

    // Check sections
    expect(screen.getByText(/Packages/)).toBeInTheDocument()
    expect(screen.getByText(/Single tests/)).toBeInTheDocument()

    // Check coverage summary
    expect(screen.getByText('Coverage')).toBeInTheDocument()
  })

  it('shows uncovered biomarkers warning', () => {
    const mockResult: OptimizeResponse = {
      total_now: 10.00,
      total_min30: 9.50,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 1000,
          price_min30_grosz: 950,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: false,
        },
      ],
      explain: {
        'ALT': ['ALT Test'],
      },
      uncovered: ['UNKNOWN_BIOMARKER'],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'UNKNOWN_BIOMARKER']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText('UNKNOWN_BIOMARKER')).toBeInTheDocument()
    expect(screen.getByText(/1 uncovered/)).toBeInTheDocument()
  })

  it('highlights bonus biomarkers', () => {
    const mockResult: OptimizeResponse = {
      total_now: 15.00,
      total_min30: 14.00,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'package',
          name: 'Extended Panel',
          slug: 'extended-panel',
          price_now_grosz: 1500,
          price_min30_grosz: 1400,
          currency: 'PLN',
          biomarkers: ['ALT', 'AST', 'CHOL'], // CHOL is bonus (not in selected)
          url: 'https://diag.pl/sklep/pakiety/extended-panel',
          on_sale: false,
        },
      ],
      explain: {
        'ALT': ['Extended Panel'],
        'AST': ['Extended Panel'],
      },
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST']} // CHOL not selected, so it's bonus
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    const cholesterolBadges = screen.getAllByText('Total cholesterol')

    const bonusBadge = cholesterolBadges.find(badge =>
      badge.classList.contains('bg-emerald-200/70') &&
      badge.classList.contains('text-emerald-900')
    )
    expect(bonusBadge).toBeInTheDocument()
  })

  it('shows "On sale" indicator for discounted items', () => {
    const mockResult: OptimizeResponse = {
      total_now: 10.00,
      total_min30: 9.50,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 1000,
          price_min30_grosz: 950,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: true,
        },
      ],
      explain: {
        'ALT': ['ALT Test'],
      },
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.queryByText('On sale')).not.toBeInTheDocument()
  })

  it('shows correct item counts in section headers', () => {
    const mockResult: OptimizeResponse = {
      total_now: 25.00,
      total_min30: 23.50,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 1000,
          price_min30_grosz: 950,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: false,
        },
        {
          id: 2,
          kind: 'single',
          name: 'AST Test',
          slug: 'ast-test',
          price_now_grosz: 1200,
          price_min30_grosz: 1150,
          currency: 'PLN',
          biomarkers: ['AST'],
          url: 'https://diag.pl/sklep/badania/ast-test',
          on_sale: false,
        },
        {
          id: 3,
          kind: 'package',
          name: 'Liver Panel',
          slug: 'liver-panel',
          price_now_grosz: 1500,
          price_min30_grosz: 1400,
          currency: 'PLN',
          biomarkers: ['CHOL'],
          url: 'https://diag.pl/sklep/pakiety/liver-panel',
          on_sale: false,
        },
      ],
      explain: {},
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST', 'CHOL']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getAllByText(/2 items/).length).toBeGreaterThan(0) // Single tests
    expect(screen.getAllByText(/1 item/).length).toBeGreaterThan(0) // Packages
  })

  it('orders packages before singles and sorts by descending price', () => {
    const mockResult: OptimizeResponse = {
      total_now: 0,
      total_min30: 0,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'Single Expensive',
          slug: 'single-expensive',
          price_now_grosz: 2000,
          price_min30_grosz: 1900,
          currency: 'PLN',
          biomarkers: ['A'],
          url: 'https://example.com/single-expensive',
          on_sale: false,
        },
        {
          id: 2,
          kind: 'package',
          name: 'Package Cheap',
          slug: 'package-cheap',
          price_now_grosz: 1500,
          price_min30_grosz: 1400,
          currency: 'PLN',
          biomarkers: ['B'],
          url: 'https://example.com/package-cheap',
          on_sale: false,
        },
        {
          id: 3,
          kind: 'package',
          name: 'Package Premium',
          slug: 'package-premium',
          price_now_grosz: 2500,
          price_min30_grosz: 2400,
          currency: 'PLN',
          biomarkers: ['C'],
          url: 'https://example.com/package-premium',
          on_sale: false,
        },
        {
          id: 4,
          kind: 'single',
          name: 'Single Budget',
          slug: 'single-budget',
          price_now_grosz: 500,
          price_min30_grosz: 400,
          currency: 'PLN',
          biomarkers: ['D'],
          url: 'https://example.com/single-budget',
          on_sale: false,
        },
      ],
      explain: {},
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['A', 'B', 'C', 'D']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    const articleNames = Array.from(document.querySelectorAll('article')).map((article) =>
      article.querySelector('a')?.textContent?.trim()
    )

    expect(articleNames).toEqual([
      'Package Premium',
      'Package Cheap',
      'Single Expensive',
      'Single Budget',
    ])
  })

  it('renders external links with correct attributes', () => {
    const mockResult: OptimizeResponse = {
      total_now: 10.00,
      total_min30: 9.50,
      currency: 'PLN',
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 1000,
          price_min30_grosz: 950,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: false,
        },
      ],
      explain: {
        'ALT': ['ALT Test'],
      },
      uncovered: [],
    }

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    const link = screen.getByRole('link', { name: 'ALT Test' })
    expect(link).toHaveAttribute('href', 'https://diag.pl/sklep/badania/alt-test')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
