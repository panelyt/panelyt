import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OptimizeResponse } from '@panelyt/types'

import { renderWithIntl } from '../../../test/utils'
import { OverlapSection } from '../overlap-section'
import { buildOptimizationViewModel } from '../view-model'

const makeResult = (): OptimizeResponse => ({
  total_now: 20,
  total_min30: 18,
  currency: 'PLN',
  items: [
    {
      id: 1,
      kind: 'package',
      name: 'Liver Panel',
      slug: 'liver-panel',
      price_now_grosz: 1200,
      price_min30_grosz: 1100,
      currency: 'PLN',
      biomarkers: ['ALT'],
      url: 'https://example.com/liver-panel',
      on_sale: false,
      is_synthetic_package: false,
    },
    {
      id: 2,
      kind: 'package',
      name: 'Basic Panel',
      slug: 'basic-panel',
      price_now_grosz: 800,
      price_min30_grosz: 700,
      currency: 'PLN',
      biomarkers: ['ALT'],
      url: 'https://example.com/basic-panel',
      on_sale: false,
      is_synthetic_package: false,
    },
  ],
  bonus_total_now: 0,
  explain: {},
  uncovered: [],
  labels: { ALT: 'ALT' },
  addon_suggestions: [],
})

describe('OverlapSection', () => {
  it('exposes aria state for expand/collapse', async () => {
    const user = userEvent.setup()
    const viewModel = buildOptimizationViewModel({
      selected: ['ALT'],
      result: makeResult(),
      variant: 'dark',
    })

    renderWithIntl(<OverlapSection viewModel={viewModel} />)

    const button = screen.getByRole('button', { name: /Package overlaps/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    const controlsId = button.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    expect(document.getElementById(controlsId as string)).toBeInTheDocument()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
