import { describe, expect, it } from 'vitest'

import type { OptimizeResponse } from '@panelyt/types'

import { buildOptimizationViewModel } from '../optimization-results/view-model'
import { formatCurrency } from '../../lib/format'

type OptimizeResponseOverrides = Partial<Omit<OptimizeResponse, 'items'>> & {
  items?: Array<Partial<OptimizeResponse['items'][number]>>
}

function makeOptimizeResponse(overrides: OptimizeResponseOverrides): OptimizeResponse {
  const { items: overrideItems, ...rest } = overrides
  const items: OptimizeResponse['items'] = (overrideItems ?? []).map((item, index) => {
    const {
      id = index + 1,
      kind = 'single',
      name = `Item ${index + 1}`,
      slug = `item-${index + 1}`,
      price_now_grosz = 1000,
      price_min30_grosz = 900,
      currency = 'PLN',
      biomarkers = ['ALT'],
      url = 'https://example.com',
      on_sale = false,
      ...restItem
    } = item

    return {
      id,
      kind,
      name,
      slug,
      price_now_grosz,
      price_min30_grosz,
      currency,
      biomarkers,
      url,
      on_sale,
      ...restItem,
    } as OptimizeResponse['items'][number]
  })

  return {
    total_now: 0,
    total_min30: 0,
    currency: 'PLN',
    items,
    bonus_total_now: 0,
    bonus_biomarkers: [],
    explain: {},
    uncovered: [],
    labels: {},
    addon_suggestions: [],
    ...rest,
  }
}

describe('buildOptimizationViewModel', () => {
  it('calculates coverage, savings, and overlap insights', () => {
    const response = makeOptimizeResponse({
      total_now: 30,
      total_min30: 25,
      bonus_total_now: 12.5,
      labels: {
        ALT: 'Alanine aminotransferase',
        AST: 'Aspartate aminotransferase',
      },
      items: [
        {
          kind: 'package',
          name: 'Liver Panel',
          price_now_grosz: 1800,
          price_min30_grosz: 1500,
          biomarkers: ['ALT', 'AST'],
          url: 'https://example.com/liver-panel',
          on_sale: true,
        },
        {
          kind: 'package',
          name: 'Metabolic Panel',
          price_now_grosz: 1600,
          price_min30_grosz: 1400,
          biomarkers: ['ALT', 'GLU'],
          url: 'https://example.com/metabolic-panel',
          on_sale: false,
        },
        {
          kind: 'single',
          name: 'AST Test',
          price_now_grosz: 900,
          price_min30_grosz: 800,
          biomarkers: ['AST'],
          url: 'https://example.com/ast-test',
          on_sale: false,
        },
      ],
      explain: {
        ALT: ['Liver Panel', 'Metabolic Panel'],
        AST: ['Liver Panel', 'AST Test'],
      },
      uncovered: ['GLU'],
    })

    const viewModel = buildOptimizationViewModel({
      selected: ['ALT', 'AST', 'GLU'],
      result: response,
      variant: 'light',
      biomarkerNames: {
        GLU: 'Glucose',
      },
      biomarkerPrices: {
        ALT: 1500,
        AST: 900,
        GLU: 1600,
      },
    })

    expect(viewModel.coverage.percent).toBe(67)
    expect(viewModel.coverage.uncoveredTokens).toEqual(['GLU'])
    expect(viewModel.pricing.potentialSavingsRaw).toBeCloseTo(10)
    expect(viewModel.pricing.highlightSavings).toBe(true)
    expect(viewModel.counts.packages).toBe(2)
    expect(viewModel.counts.onSale).toBe(1)
    expect(viewModel.overlaps[0]?.code).toBe('ALT')
    expect(viewModel.overlaps[0]?.packages).toEqual(['Liver Panel', 'Metabolic Panel'])
    expect(viewModel.displayNameFor('GLU')).toBe('Glucose')
    expect(viewModel.bonusPricing.totalNowValue).toBeCloseTo(12.5)
    expect(viewModel.bonusPricing.totalNowLabel).toBe(formatCurrency(12.5))
  })

  it('handles empty selections without crashing', () => {
    const response = makeOptimizeResponse({
      items: [],
      total_now: 0,
      total_min30: 0,
      explain: {},
      uncovered: [],
    })

    const viewModel = buildOptimizationViewModel({
      selected: [],
      result: response,
      variant: 'dark',
    })

    expect(viewModel.coverage.percent).toBe(0)
    expect(viewModel.pricing.highlightSavings).toBe(false)
    expect(viewModel.totalNowGrosz).toBe(0)
    expect(viewModel.totalMin30Grosz).toBe(0)
    expect(viewModel.groups[0]?.items).toHaveLength(0)
    expect(viewModel.bonusPricing.totalNowValue).toBe(0)
    expect(viewModel.bonusPricing.totalNowLabel).toBe(formatCurrency(0))
  })

  it('treats synthetic packages as packages in grouping and overlaps', () => {
    const response = makeOptimizeResponse({
      items: [
        {
          kind: 'single',
          name: 'Panel pierwiastków Zn, Cu, Se',
          price_now_grosz: 10355,
          price_min30_grosz: 10355,
          biomarkers: ['CYNK', 'MIEDZ', 'SELEN'],
          url: 'https://example.com/panel',
          on_sale: false,
          is_synthetic_package: true,
        },
        {
          kind: 'package',
          name: 'Pakiet minerały',
          price_now_grosz: 9800,
          price_min30_grosz: 9000,
          biomarkers: ['CYNK', 'SELEN'],
          url: 'https://example.com/mineraly',
          on_sale: false,
        },
        {
          kind: 'single',
          name: 'Cynk',
          price_now_grosz: 4000,
          price_min30_grosz: 3500,
          biomarkers: ['CYNK'],
          url: 'https://example.com/cynk',
          on_sale: false,
        },
      ],
    })

    const viewModel = buildOptimizationViewModel({
      selected: ['CYNK', 'MIEDZ'],
      result: response,
      variant: 'light',
    })

    expect(viewModel.counts.packages).toBe(2)
    expect(viewModel.groups[0]?.items[0]?.name).toBe('Panel pierwiastków Zn, Cu, Se')
    expect(viewModel.overlaps[0]?.packages).toEqual([
      'Panel pierwiastków Zn, Cu, Se',
      'Pakiet minerały',
    ])
  })

  it('uses bonus biomarkers from the response payload', () => {
    const response = makeOptimizeResponse({
      items: [
        {
          kind: 'single',
          name: 'Panel pierwiastków Zn, Cu, Se',
          price_now_grosz: 10355,
          price_min30_grosz: 10355,
          biomarkers: ['CYNK', 'MIEDZ', 'SELEN'],
          url: 'https://example.com/panel',
          on_sale: false,
          is_synthetic_package: true,
        },
      ],
      bonus_biomarkers: [],
    })

    const viewModel = buildOptimizationViewModel({
      selected: ['CYNK'],
      result: response,
      variant: 'light',
    })

    expect(viewModel.bonusBiomarkers).toEqual([])
  })
})
