import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OptimizeResponse } from '@panelyt/types'

import { renderWithIntl } from '../../../test/utils'
import { ExclusiveSection } from '../exclusive-section'
import { buildOptimizationViewModel } from '../view-model'

const makeResult = (): OptimizeResponse => ({
  total_now: 10,
  total_min30: 9,
  currency: 'PLN',
  items: [
    {
      id: 1,
      kind: 'single',
      name: 'ALT Test',
      slug: 'alt-test',
      price_now_grosz: 1000,
      price_min30_grosz: 900,
      currency: 'PLN',
      biomarkers: ['ALT'],
      url: 'https://example.com/alt',
      on_sale: false,
      lab_code: 'diag',
      lab_name: 'Diagnostyka',
    },
  ],
  bonus_total_now: 0,
  explain: {},
  uncovered: [],
  lab_code: 'diag',
  lab_name: 'Diagnostyka',
  exclusive: { ALT: 'ALT' },
  labels: { ALT: 'ALT' },
  mode: 'auto',
  lab_options: [],
  lab_selections: [],
  addon_suggestions: [],
})

describe('ExclusiveSection', () => {
  it('uses light mode contrast and exposes aria state', async () => {
    const user = userEvent.setup()
    const viewModel = buildOptimizationViewModel({
      selected: ['ALT'],
      result: makeResult(),
      variant: 'light',
    })

    renderWithIntl(<ExclusiveSection viewModel={viewModel} />)

    const button = screen.getByRole('button', { name: /Exclusive to Diagnostyka/i })
    const header = button.firstElementChild as HTMLElement

    expect(header).toHaveClass('text-amber-700')
    expect(button).toHaveAttribute('aria-expanded', 'true')

    const controlsId = button.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()
    expect(document.getElementById(controlsId as string)).toBeInTheDocument()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})
