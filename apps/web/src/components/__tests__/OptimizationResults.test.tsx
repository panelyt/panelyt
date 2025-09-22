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
    mockUseBiomarkerLookup.mockReturnValue({
      data: {
        'ALT': 'Alanine aminotransferase',
        'AST': 'Aspartate aminotransferase',
        'CHOL': 'Total cholesterol',
      },
    } as any)
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

    expect(screen.getByText('Select at least one biomarker to see the cheapest mix of single tests and packages.')).toBeInTheDocument()
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

    expect(screen.getByText('Calculating optimal combination…')).toBeInTheDocument()
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

    expect(screen.getByText('Optimization failed: Network error')).toBeInTheDocument()
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
    expect(screen.getByText('Optimal basket')).toBeInTheDocument()
    expect(screen.getByText('Covers 3 biomarkers using the lowest current prices.')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument() // Current total
    expect(screen.getByText('$23.50')).toBeInTheDocument() // Min total

    // Check items are displayed
    expect(screen.getByText('ALT Test')).toBeInTheDocument()
    expect(screen.getByText('Liver Panel')).toBeInTheDocument()

    // Check sections
    expect(screen.getByText('Packages')).toBeInTheDocument()
    expect(screen.getByText('Single tests')).toBeInTheDocument()

    // Check coverage matrix
    expect(screen.getByText('Coverage matrix')).toBeInTheDocument()
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

    expect(screen.getByText(/Unable to cover: UNKNOWN_BIOMARKER/)).toBeInTheDocument()
    expect(screen.getByText(/These biomarkers are missing from the catalog/)).toBeInTheDocument()
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

    // Should find CHOL badges with bonus styling
    const bonusBadge = cholesterolBadges.find(badge =>
      badge.classList.contains('bg-emerald-100') &&
      badge.classList.contains('text-emerald-700')
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

    expect(screen.getByText('On sale')).toBeInTheDocument()
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

    expect(screen.getByText('2 items')).toBeInTheDocument() // Single tests
    expect(screen.getByText('1 item')).toBeInTheDocument() // Packages
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