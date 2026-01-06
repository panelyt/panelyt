import { screen } from '@testing-library/react'
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
    lab_code: 'diag',
    lab_name: 'Diagnostyka',
  },
  upgrade_cost_grosz: 100,
  upgrade_cost: 1,
  estimated_total_now_grosz: 1100,
  estimated_total_now: 11,
  covers: [],
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
})
