import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OptimizeResponse } from '@panelyt/types'

import { renderWithIntl } from '../../../test/utils'
import { AddonSuggestionsCollapsible } from '../addon-suggestions-collapsible'

const makeSuggestion = (): OptimizeResponse['addon_suggestions'][number] => ({
  package: {
    id: 1,
    kind: 'package',
    name: 'Liver Panel',
    slug: 'liver-panel',
    price_now_grosz: 1000,
    price_min30_grosz: 900,
    currency: 'PLN',
    biomarkers: ['ALT'],
    url: 'https://example.com/liver-panel',
    on_sale: false,
  },
  upgrade_cost_grosz: 100,
  upgrade_cost: 1,
  estimated_total_now_grosz: 1100,
  estimated_total_now: 11,
  covers: [{ code: 'ALT', display_name: 'ALT' }],
  adds: [{ code: 'AST', display_name: 'AST' }],
  removes: [],
  keeps: [],
})

describe('AddonSuggestionsCollapsible', () => {
  const originalLocalStorage = window.localStorage

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    })
  })

  it('exposes aria state and reduced-motion classes for the collapsible', async () => {
    const user = userEvent.setup()
    window.localStorage.removeItem('panelyt:addons-expanded')

    renderWithIntl(
      <AddonSuggestionsCollapsible suggestions={[makeSuggestion()]} isLoading={false} />,
    )

    const button = screen.getByRole('button', { name: /Add more for less/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    const controlsId = button.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()

    const content = document.getElementById(controlsId as string)
    expect(content).toBeInTheDocument()
    expect(content).toHaveClass('motion-reduce:transition-none')

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('disables loader animation when reduced motion is requested', () => {
    const { container } = renderWithIntl(
      <AddonSuggestionsCollapsible suggestions={[]} isLoading />,
    )

    const loader = container.querySelector('svg.animate-spin')
    expect(loader).toHaveClass('motion-reduce:animate-none')
  })

  it('renders even when localStorage throws', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('no storage')
        },
        setItem: () => {
          throw new Error('no storage')
        },
      },
      configurable: true,
    })

    expect(() => {
      renderWithIntl(
        <AddonSuggestionsCollapsible suggestions={[makeSuggestion()]} isLoading={false} />,
      )
    }).not.toThrow()

    expect(screen.getByText('Add more for less')).toBeInTheDocument()
  })

  it('shows covered biomarkers as neutral pills', async () => {
    const user = userEvent.setup()
    renderWithIntl(
      <AddonSuggestionsCollapsible suggestions={[makeSuggestion()]} isLoading={false} />,
    )

    await user.click(screen.getByRole('button', { name: /Add more for less/i }))

    const coveredPill = screen.getByText('ALT')
    expect(coveredPill).toHaveClass('bg-surface-1')
  })
})
