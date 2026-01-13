import { screen } from '@testing-library/react'

import { renderWithIntl } from '../../../test/utils'
import { SummarySection } from '../summary-section'
import { buildOptimizationViewModel } from '../view-model'

import type { OptimizeResponse } from '@panelyt/types'
import plMessages from '../../../i18n/messages/pl.json'

const buildResult = (): OptimizeResponse => ({
  total_now: 120,
  total_min30: 110,
  currency: 'PLN',
  items: [
    {
      id: 1,
      kind: 'package',
      name: 'Liver Panel',
      slug: 'liver-panel',
      price_now_grosz: 6000,
      price_min30_grosz: 5500,
      currency: 'PLN',
      biomarkers: ['ALT', 'AST', 'CHOL'],
      url: 'https://diag.pl/sklep/pakiety/liver-panel',
      on_sale: false,
    },
    {
      id: 2,
      kind: 'package',
      name: 'Metabolic Panel',
      slug: 'metabolic-panel',
      price_now_grosz: 6000,
      price_min30_grosz: 5500,
      currency: 'PLN',
      biomarkers: ['ALT', 'GLU'],
      url: 'https://diag.pl/sklep/pakiety/metabolic-panel',
      on_sale: false,
    },
  ],
  bonus_total_now: 15,
  explain: {},
  uncovered: [],
  labels: { ALT: 'ALT', AST: 'AST', CHOL: 'CHOL', GLU: 'GLU' },
  addon_suggestions: [],
})

describe('SummarySection', () => {
  it('renders Polish translations for summary content', () => {
    const viewModel = buildOptimizationViewModel({
      selected: ['ALT', 'AST'],
      result: buildResult(),
      variant: 'light',
    })

    renderWithIntl(
      <SummarySection
        viewModel={viewModel}
      />,
      { locale: 'pl', messages: plMessages }
    )

    expect(document.body.textContent).toContain('Podsumowanie optymalizacji')
    expect(document.body.textContent).toContain('Oszczędności')
    expect(document.body.textContent).toContain('Wartość bonusu')
    expect(document.body.textContent).toContain('Pozycja ceny')
    expect(document.body.textContent).toContain('Nakładanie pakietów')
    expect(document.body.textContent).toContain('Kliknij, aby zobaczyć badania w wielu pakietach')
  })

  it('uses translated placeholder when savings and bonus are empty', () => {
    const viewModel = buildOptimizationViewModel({
      selected: ['ALT', 'AST'],
      result: {
        ...buildResult(),
        total_now: 100,
        total_min30: 100,
        bonus_total_now: 0,
      },
      variant: 'light',
    })

    const messages = {
      ...plMessages,
      common: {
        ...plMessages.common,
        placeholderDash: 'N/A',
      },
    } as typeof plMessages

    renderWithIntl(
      <SummarySection
        viewModel={viewModel}
      />,
      { locale: 'pl', messages }
    )

    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0)
  })
})
