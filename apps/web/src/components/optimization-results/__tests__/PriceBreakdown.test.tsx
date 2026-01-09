import { act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { vi } from 'vitest'
import type { OptimizeResponse } from '@panelyt/types'

import { renderWithIntl } from '../../../test/utils'
import enMessages from '../../../i18n/messages/en.json'
import { buildOptimizationViewModel } from '../view-model'
import { PriceBreakdownSection } from '../price-breakdown'

const makeOptimizeResponse = (overrides: Partial<OptimizeResponse> = {}): OptimizeResponse => ({
  total_now: 10,
  total_min30: 9.5,
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
  bonus_total_now: 0,
  explain: {},
  uncovered: [],
  labels: { ALT: 'ALT' },
  addon_suggestions: [],
  ...overrides,
})

describe('PriceBreakdownSection', () => {
  it('highlights totals briefly when the total changes', () => {
    vi.useFakeTimers()

    const initialViewModel = buildOptimizationViewModel({
      selected: ['ALT'],
      result: makeOptimizeResponse({ total_now: 10, total_min30: 9.5 }),
      variant: 'light',
    })

    const { rerender, getByTestId } = renderWithIntl(
      <PriceBreakdownSection viewModel={initialViewModel} />,
    )

    const totalContainer = getByTestId('price-breakdown-total')
    expect(totalContainer.className).not.toContain('ring-accent-cyan')

    const updatedViewModel = buildOptimizationViewModel({
      selected: ['ALT'],
      result: makeOptimizeResponse({ total_now: 12, total_min30: 9.5 }),
      variant: 'light',
    })

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PriceBreakdownSection viewModel={updatedViewModel} />
      </NextIntlClientProvider>,
    )

    expect(totalContainer.className).toContain('ring-accent-cyan')

    act(() => {
      vi.advanceTimersByTime(240)
    })

    expect(totalContainer.className).not.toContain('ring-accent-cyan')

    vi.useRealTimers()
  })
})
