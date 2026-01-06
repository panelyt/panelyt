import { screen, waitFor } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { vi } from 'vitest'
import { OptimizationResults } from '../optimization-results'
import type { OptimizeResponse } from '@panelyt/types'
import type { ReactNode } from 'react'
import { renderWithQueryClient } from '../../test/utils'
import plMessages from '../../i18n/messages/pl.json'
import { track, consumeTtorDuration } from '../../lib/analytics'

// Mock the hooks
vi.mock('../../hooks/useBiomarkerLookup', () => ({
  useBiomarkerLookup: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
  consumeTtorDuration: vi.fn(),
}))

vi.mock('../../lib/format', () => ({
  formatCurrency: vi.fn((value) => `$${value.toFixed(2)}`),
  formatGroszToPln: vi.fn((grosz) => `$${(grosz / 100).toFixed(2)}`),
}))

import { useBiomarkerLookup } from '../../hooks/useBiomarkerLookup'

const mockUseBiomarkerLookup = vi.mocked(useBiomarkerLookup)
const trackMock = vi.mocked(track)
const consumeTtorDurationMock = vi.mocked(consumeTtorDuration)

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
    addon_suggestions: [],
    ...rest,
  }
}

describe('OptimizationResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackMock.mockClear()
    consumeTtorDurationMock.mockReset()
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

  it('tracks optimize_result_rendered events with summary payload', async () => {
    consumeTtorDurationMock.mockReturnValueOnce(1500)
    const result = makeOptimizeResponse({
      total_now: 25,
      lab_code: 'diag',
      uncovered: ['ALT', 'AST'],
      items: [
        {
          id: 1,
          kind: 'single',
          name: 'ALT',
          price_now_grosz: 1000,
          price_min30_grosz: 900,
          biomarkers: ['ALT'],
          on_sale: false,
          url: 'https://example.com/alt',
        },
      ],
    })

    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT', 'AST']}
        result={result}
        isLoading={false}
        error={null}
      />,
    )

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith('optimize_result_rendered', {
        labChoice: 'diag',
        total: 25,
        uncoveredCount: 2,
        ttorMs: 1500,
      })
    })
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

  it('uses light styling for the empty state when variant is light', () => {
    renderWithQueryClient(
      <OptimizationResults
        selected={[]}
        result={undefined}
        isLoading={false}
        error={null}
        variant="light"
      />,
    )

    const container = screen.getByText(/Start by adding biomarkers above/)

    expect(container).toHaveClass('border-slate-200')
    expect(container).toHaveClass('bg-white')
    expect(container).toHaveClass('text-slate-600')
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

    expect(screen.getByText('Crunching the optimal basket...')).toBeInTheDocument()
  })

  it('uses light styling for the loading state when variant is light', () => {
    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={undefined}
        isLoading={true}
        error={null}
        variant="light"
      />,
    )

    const container = screen
      .getByText('Crunching the optimal basket...')
      .closest('div') as HTMLElement

    expect(container).toHaveClass('border-slate-200')
    expect(container).toHaveClass('bg-white')
    expect(container).toHaveClass('text-slate-700')
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

  it('uses light styling for the error state when variant is light', () => {
    const error = new Error('Network error')
    renderWithQueryClient(
      <OptimizationResults
        selected={['ALT']}
        result={undefined}
        isLoading={false}
        error={error}
        variant="light"
      />,
    )

    const outer = screen
      .getByText('Optimization failed')
      .closest('div')
      ?.parentElement as HTMLElement

    expect(outer).toHaveClass('border-red-200')
    expect(outer).toHaveClass('bg-red-50')
    expect(outer).toHaveClass('text-red-700')
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

    // Check header information from price breakdown
    expect(screen.getByText('Your order from Diagnostyka')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()

    // Check items are displayed
    expect(screen.getAllByRole('link', { name: 'ALT Test' })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Liver Panel' })[0]).toBeInTheDocument()

    // Check sections
    expect(screen.getByText(/Packages/)).toBeInTheDocument()
    expect(screen.getByText(/Single tests/)).toBeInTheDocument()
    expect(screen.getByText('DIAG')).toBeInTheDocument()
    expect(screen.getByText('BOTH LABS')).toBeInTheDocument()

    // Check coverage summary
  })

  it('renders coverage gaps when there are uncovered biomarkers', () => {
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

    expect(screen.getByRole('heading', { name: 'Coverage gaps' })).toBeInTheDocument()
    expect(screen.getAllByText('UNKNOWN_BIOMARKER')).toHaveLength(2)
    expect(
      screen.getByText('1 biomarker cannot be covered by this lab'),
    ).toBeInTheDocument()
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

    expect(
      screen.getByTitle(/Total cholesterol \(CHOL\) · Bonus coverage/),
    ).toBeInTheDocument()
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

    expect(screen.getByText('Your order from Multiple labs')).toBeInTheDocument()
    expect(screen.getByText('DIAG')).toBeInTheDocument()
    expect(screen.getByText('ALAB')).toBeInTheDocument()
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

    expect(screen.getByText('Your order from Diagnostyka')).toBeInTheDocument()
    expect(screen.getByText('ALT Test')).toBeInTheDocument()
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

  it('renders Polish translations for optimization UI', () => {
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
          on_sale: false,
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
            title: 'Tylko DIAG',
            priceLabel: '$25.00',
            meta: '0 Brakuje · 0 Bonus',
            badge: 'Najtaniej',
            active: true,
            loading: false,
            disabled: false,
            onSelect: vi.fn(),
            priceValue: 25,
            icon: <Sparkles className="h-4 w-4" />,
            accentLight: 'bg-emerald-500/10 text-emerald-600',
            accentDark: 'bg-emerald-500/20 text-emerald-200',
          },
        ]}
        addonSuggestionsLoading={true}
      />,
      { locale: 'pl', messages: plMessages }
    )

    expect(screen.getByText('Twoje zamówienie: Diagnostyka')).toBeInTheDocument()
    expect(screen.getByText('Suma')).toBeInTheDocument()
    expect(screen.getByText('Najlepsze ceny')).toBeInTheDocument()
    expect(screen.getByText('Szukamy sugestii...')).toBeInTheDocument()
    expect(screen.getByText(/Pakiety/)).toBeInTheDocument()
    expect(screen.getByText(/Badania pojedyncze/)).toBeInTheDocument()
  })

})
