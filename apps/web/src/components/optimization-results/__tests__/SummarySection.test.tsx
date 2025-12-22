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
      lab_code: 'diag',
      lab_name: 'Diagnostyka',
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
      lab_code: 'diag',
      lab_name: 'Diagnostyka',
    },
  ],
  bonus_total_now: 15,
  explain: {},
  uncovered: [],
  lab_code: 'diag',
  lab_name: 'Diagnostyka',
  exclusive: { ALT: 'Diagnostyka' },
  labels: { ALT: 'ALT', AST: 'AST', CHOL: 'CHOL', GLU: 'GLU' },
  mode: 'auto',
  lab_options: [],
  lab_selections: [],
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
        labCards={[]}
      />,
      { locale: 'pl', messages: plMessages }
    )

    expect(document.body.textContent).toContain('Podsumowanie optymalizacji')
    expect(document.body.textContent).toContain('Potencjalne oszczędności')
    expect(document.body.textContent).toContain('Wartość bonusu')
    expect(document.body.textContent).toContain('Pozycja ceny')
    expect(document.body.textContent).toContain('Tylko w laboratorium Diagnostyka')
    expect(document.body.textContent).toContain('Nakładanie pakietów')
    expect(document.body.textContent).toContain('Kliknij, aby zobaczyć biomarkery w wielu pakietach')
  })
})
