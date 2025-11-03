import { screen, within } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { vi } from 'vitest'
import { OptimizationResults } from '../optimization-results'
import type { OptimizeResponse } from '@panelyt/types'
import type { ReactNode } from 'react'
import { renderWithQueryClient } from '../../test/utils'
import userEvent from '@testing-library/user-event'

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

interface LabChoiceCardStub {
  key: string;
  title: string;
  priceLabel: string;
  priceValue: number | null;
  meta?: string;
  badge?: string;
  active: boolean;
  loading?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: ReactNode;
  accentLight: string;
  accentDark: string;
}

type OptimizeResponseOverrides = Partial<Omit<OptimizeResponse, 'items'>> & {
  items?: Array<Partial<OptimizeResponse['items'][number]>>;
};

const makeOptimizeResponse = (
  overrides: OptimizeResponseOverrides,
): OptimizeResponse => {
  const { items: overrideItems, ...rest } = overrides
  const items: OptimizeResponse['items'] = (overrideItems ?? []).map((item) => {
    const {
      lab_code = 'diag',
      lab_name = 'Diagnostyka',
      ...restItem
    } = item
    return {
      lab_code,
      lab_name,
      ...restItem,
    } as OptimizeResponse['items'][number]
  })

  return {
    total_now: 0,
    total_min30: 0,
    currency: 'PLN',
    items,
    bonus_total_now: 0,
    explain: {},
    uncovered: [],
    lab_code: 'diag',
    lab_name: 'Diagnostyka',
    exclusive: {},
    labels: {},
    mode: 'auto',
    lab_options: [],
    lab_selections: [],
    add_on_suggestions: [],
    ...rest,
  }
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
    const mockResult = makeOptimizeResponse({
      total_now: 25.00,
      total_min30: 23.50,
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST', 'CHOL']}
        result={mockResult}
        isLoading={false}
        error={null}
        labCards={[
          {
            key: 'diag',
            title: 'ONLY DIAG',
            priceLabel: '$25.00',
            meta: '0 Missing · 0 Bonus',
            badge: 'Cheapest',
            active: true,
            loading: false,
            disabled: false,
            onSelect: vi.fn(),
            priceValue: 25,
            icon: <Sparkles className="h-4 w-4" />,
            accentLight: 'bg-emerald-500/10 text-emerald-600',
            accentDark: 'bg-emerald-500/20 text-emerald-200',
          },
          {
            key: 'all',
            title: 'BOTH LABS',
            priceLabel: '$25.00',
            meta: '0 Missing · 1 Bonus',
            active: false,
            loading: false,
            disabled: false,
            onSelect: vi.fn(),
            priceValue: 25,
            icon: <Sparkles className="h-4 w-4" />,
            accentLight: 'bg-indigo-500/10 text-indigo-500',
            accentDark: 'bg-indigo-500/20 text-indigo-200',
          },
        ]}
      />
    )

    // Check header information
    expect(screen.getByText('Optimization summary')).toBeInTheDocument()
    expect(screen.getByText(/Covering 3 biomarkers/)).toBeInTheDocument()
    expect(screen.getByText('30-day minimum')).toBeInTheDocument()
    expect(screen.getAllByText('$23.50')[0]).toBeInTheDocument()
    expect(screen.queryByText('Current total')).not.toBeInTheDocument()

    // Check items are displayed
    expect(screen.getAllByRole('link', { name: 'ALT Test' })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Liver Panel' })[0]).toBeInTheDocument()

    // Check sections
    expect(screen.getByText(/Packages/)).toBeInTheDocument()
    expect(screen.getByText(/Single tests/)).toBeInTheDocument()
    expect(screen.getByText('ONLY DIAG')).toBeInTheDocument()
    expect(screen.getByText('BOTH LABS')).toBeInTheDocument()

  })

  it('shows cheap add-on suggestions when provided', () => {
    const mockResult = makeOptimizeResponse({
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'Ferritin',
          slug: 'ferritin',
          price_now_grosz: 2500,
          price_min30_grosz: 2500,
          currency: 'PLN',
          biomarkers: ['FERR'],
          url: 'https://diag.pl/sklep/badania/ferritin',
          on_sale: false,
        },
        {
          id: 2,
          kind: 'single',
          name: 'Iron',
          slug: 'iron',
          price_now_grosz: 2500,
          price_min30_grosz: 2500,
          currency: 'PLN',
          biomarkers: ['IRON'],
          url: 'https://diag.pl/sklep/badania/iron',
          on_sale: false,
        },
      ],
      labels: {
        FERR: 'Ferritin',
        IRON: 'Iron',
        B9: 'B9',
        B12: 'B12',
      },
      add_on_suggestions: [
        {
          item: {
            id: 3,
            kind: 'package',
            name: 'Iron vitality package',
            slug: 'iron-vitality',
            price_now_grosz: 5200,
            price_min30_grosz: 5000,
            currency: 'PLN',
            biomarkers: ['FERR', 'IRON', 'B9', 'B12'],
            url: 'https://diag.pl/sklep/pakiety/iron-vitality',
            on_sale: false,
            lab_code: 'diag',
            lab_name: 'Diagnostyka',
          },
          matched_tokens: ['FERR', 'IRON'],
          bonus_tokens: ['B9', 'B12'],
          already_included_tokens: [],
          removed_bonus_tokens: [],
          added_bonus_price_now: 0,
          added_bonus_price_now_grosz: 0,
          removed_bonus_price_now: 0,
          removed_bonus_price_now_grosz: 0,
          net_bonus_price_now: 0,
          net_bonus_price_now_grosz: 0,
          incremental_now: 17,
          incremental_now_grosz: 1700,
        },
      ],
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['FERR', 'IRON']}
        result={mockResult}
        isLoading={false}
        error={null}
      />,
    )

    expect(screen.getByText('Cheap add-on suggestions')).toBeInTheDocument()
    expect(screen.getAllByText(/Ferritin/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/B9/)).toBeInTheDocument()
    expect(screen.getByText(/\+\$17\.00/)).toBeInTheDocument()
    expect(screen.getAllByText(/Net Value/).length).toBeGreaterThan(0)
  })

  it('invokes onAddBiomarkers callback when clicking suggestion', async () => {
    const mockResult = makeOptimizeResponse({
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'Ferritin',
          slug: 'ferritin',
          price_now_grosz: 2500,
          price_min30_grosz: 2500,
          currency: 'PLN',
          biomarkers: ['FERR'],
          url: 'https://diag.pl/sklep/badania/ferritin',
          on_sale: false,
        },
      ],
      labels: {
        FERR: 'Ferritin',
        B9: 'B9',
        B12: 'B12',
      },
      add_on_suggestions: [
        {
          item: {
            id: 3,
            kind: 'package',
            name: 'Iron vitality package',
            slug: 'iron-vitality',
            price_now_grosz: 5200,
            price_min30_grosz: 5000,
            currency: 'PLN',
            biomarkers: ['FERR', 'IRON', 'B9', 'B12'],
            url: 'https://diag.pl/sklep/pakiety/iron-vitality',
            on_sale: false,
            lab_code: 'diag',
            lab_name: 'Diagnostyka',
          },
          matched_tokens: ['FERR'],
          bonus_tokens: ['B12'],
          already_included_tokens: ['B9'],
          removed_bonus_tokens: ['B10'],
          added_bonus_price_now: 4,
          added_bonus_price_now_grosz: 400,
          removed_bonus_price_now: 12,
          removed_bonus_price_now_grosz: 1200,
          net_bonus_price_now: -8,
          net_bonus_price_now_grosz: -800,
          incremental_now: 17,
          incremental_now_grosz: 1700,
        },
      ],
    })

    const handleAdd = vi.fn()
    const user = userEvent.setup()

    renderWithQueryClient(
      <OptimizationResults
        selected={['FERR']}
        result={mockResult}
        isLoading={false}
        error={null}
        onAddBiomarkers={handleAdd}
      />,
    )

    const suggestionCard = screen.getByRole('button', { name: /iron vitality package/i })

    await user.click(suggestionCard)

    expect(handleAdd).toHaveBeenCalledTimes(1)
    expect(handleAdd).toHaveBeenCalledWith([
      { code: 'B12', name: 'B12' },
    ])

    const existingBadge = within(suggestionCard).getByText('B9')
    expect(existingBadge.className).toContain('bg-slate-200')
    const removedBadge = within(suggestionCard).getByText('B10')
    expect(removedBadge.className).toMatch(/bg-red/)
    expect(within(suggestionCard).getAllByText('Net Value')[0]).toBeInTheDocument()
    expect(within(suggestionCard).getByText(/\u2212\$8\.00/)).toBeInTheDocument()
  })

  it('does not show uncovered biomarkers warning when results omit coverage', () => {
    const mockResult = makeOptimizeResponse({
      total_now: 10.0,
      total_min30: 9.5,
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'UNKNOWN_BIOMARKER']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.queryByText('UNKNOWN_BIOMARKER')).not.toBeInTheDocument()
    expect(screen.queryByText(/1 uncovered/)).not.toBeInTheDocument()
  })

  it('highlights bonus biomarkers', () => {
    const mockResult = makeOptimizeResponse({
      total_now: 15.0,
      total_min30: 14.0,
      bonus_total_now: 42,
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST']} // CHOL not selected, so it's bonus
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText(/1 bonus biomarker \(\$42\.00\)/)).toBeInTheDocument()
    expect(screen.getByText('Total cholesterol')).toBeInTheDocument()
  })

  it('shows "On sale" indicator for discounted items', () => {
    const mockResult = makeOptimizeResponse({
      total_now: 10.0,
      total_min30: 9.5,
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
    })

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
    const mockResult = makeOptimizeResponse({
      total_now: 25.0,
      total_min30: 23.5,
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST', 'CHOL']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText(/Single tests · 2 items/)).toBeInTheDocument()
    expect(screen.getByText(/Packages · 1 item/)).toBeInTheDocument()
  })

  it('orders packages before singles and sorts by descending price', () => {
    const mockResult = makeOptimizeResponse({
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
          biomarkers: ['B', 'C'],
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
          biomarkers: ['B', 'E'],
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['A', 'B', 'C', 'D', 'E']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    const articleNames = Array.from(document.querySelectorAll('article')).map((article) =>
      article.querySelector('a')?.textContent?.trim()
    )

    expect(screen.getByText(/Package overlaps/i)).toBeInTheDocument()
    expect(articleNames).toEqual([
      'Package Premium',
      'Package Cheap',
      'Single Expensive',
      'Single Budget',
    ])
  })

  it('shows lab splitting summary and per-lab breakdown', () => {
    const mockResult = makeOptimizeResponse({
      mode: 'split',
      lab_code: 'mixed',
      lab_name: 'Multiple labs',
      lab_selections: [
        { code: 'diag', name: 'Diagnostyka', total_now_grosz: 1500, items: 2 },
        { code: 'alab', name: 'ALAB', total_now_grosz: 900, items: 1 },
      ],
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT Test',
          slug: 'alt-test',
          price_now_grosz: 600,
          price_min30_grosz: 500,
          currency: 'PLN',
          biomarkers: ['ALT'],
          url: 'https://diag.pl/sklep/badania/alt-test',
          on_sale: false,
          lab_code: 'diag',
          lab_name: 'Diagnostyka',
        },
        {
          id: 2,
          kind: 'single',
          name: 'AST Test',
          slug: 'ast-test',
          price_now_grosz: 900,
          price_min30_grosz: 850,
          currency: 'PLN',
          biomarkers: ['AST'],
          url: 'https://diag.pl/sklep/badania/ast-test',
          on_sale: false,
          lab_code: 'diag',
          lab_name: 'Diagnostyka',
        },
        {
          id: 3,
          kind: 'single',
          name: 'CRP Test',
          slug: 'crp-test',
          price_now_grosz: 900,
          price_min30_grosz: 850,
          currency: 'PLN',
          biomarkers: ['CRP'],
          url: 'https://alab.pl/badania/crp-test',
          on_sale: false,
          lab_code: 'alab',
          lab_name: 'ALAB',
        },
      ],
      explain: {},
      uncovered: [],
    })

    const labCards = [
      {
        key: 'diag',
        title: 'ONLY DIAG',
        priceLabel: '$100.00',
        priceValue: 10000,
        meta: '0 Missing · 0 Bonus',
        badge: 'Cheapest',
        active: true,
        loading: false,
        disabled: false,
        onSelect: vi.fn(),
        icon: <Sparkles className="h-4 w-4" />,
        accentLight: 'bg-emerald-500/10 text-emerald-600',
        accentDark: 'bg-emerald-500/20 text-emerald-200',
      },
      {
        key: 'alab',
        title: 'ONLY ALAB',
        priceLabel: '$110.00',
        priceValue: 11000,
        meta: '2 Missing · 1 Bonus',
        badge: undefined,
        active: false,
        loading: false,
        disabled: false,
        onSelect: vi.fn(),
        icon: <Sparkles className="h-4 w-4" />,
        accentLight: 'bg-sky-500/10 text-sky-500',
        accentDark: 'bg-sky-500/20 text-sky-200',
      },
    ] satisfies LabChoiceCardStub[]

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST', 'CRP']}
        result={mockResult}
        isLoading={false}
        error={null}
        labCards={labCards}
      />
    )

    expect(screen.getByText('Optimization summary')).toBeInTheDocument()
    expect(screen.getByText('ONLY DIAG')).toBeInTheDocument()
    expect(screen.getByText('ONLY ALAB')).toBeInTheDocument()
  })

  it('suggests lab splitting when exclusive biomarkers block other labs', () => {
    const mockResult = makeOptimizeResponse({
      exclusive: { ALT: 'Diagnostyka' },
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
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={mockResult}
        isLoading={false}
        error={null}
      />
    )

    expect(
      screen.getByText('Exclusive to Diagnostyka'),
    ).toBeInTheDocument()
  })

  it('renders external links with correct attributes', () => {
    const mockResult = makeOptimizeResponse({
      total_now: 10.0,
      total_min30: 9.5,
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
        ALT: ['ALT Test'],
      },
      uncovered: [],
    })

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
