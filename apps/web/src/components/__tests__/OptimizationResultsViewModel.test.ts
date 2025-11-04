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
      lab_code = 'diag',
      lab_name = 'Diagnostyka',
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
      exclusive: {
        GLU: 'Diagnostyka',
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
    })

    expect(viewModel.coverage.percent).toBe(67)
    expect(viewModel.coverage.uncoveredTokens).toEqual(['GLU'])
    expect(viewModel.pricing.potentialSavingsRaw).toBeCloseTo(5)
    expect(viewModel.pricing.highlightSavings).toBe(true)
    expect(viewModel.counts.packages).toBe(2)
    expect(viewModel.counts.onSale).toBe(1)
    expect(viewModel.exclusive.biomarkers[0]?.code).toBe('GLU')
    expect(viewModel.exclusive.biomarkers[0]?.displayName).toBe('Glucose')
    expect(viewModel.overlaps[0]?.code).toBe('ALT')
    expect(viewModel.overlaps[0]?.packages).toEqual(['Liver Panel', 'Metabolic Panel'])
    expect(viewModel.displayNameFor('GLU')).toBe('Glucose')
    expect(viewModel.bonusPricing.totalNowValue).toBeCloseTo(12.5)
    expect(viewModel.bonusPricing.totalNowLabel).toBe(formatCurrency(12.5))
    expect(viewModel.addons).toHaveLength(0)
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
    expect(viewModel.addons).toHaveLength(0)
  })

  it('maps addon suggestions onto the view model', () => {
    const response = makeOptimizeResponse({
      total_now: 40,
      addon_suggestions: [
        {
          package: {
            id: 99,
            kind: 'package',
            name: 'Expanded Liver Panel',
            slug: 'expanded-liver',
            price_now_grosz: 3600,
            price_min30_grosz: 3400,
            currency: 'PLN',
            biomarkers: ['ALT', 'AST', 'CRP'],
            url: 'https://example.com/panels/expanded-liver',
            on_sale: false,
            lab_code: 'diag',
            lab_name: 'Diagnostyka',
          },
          upgrade_cost_grosz: 1200,
          upgrade_cost: 12,
          estimated_total_now_grosz: 5200,
          estimated_total_now: 52,
          covers: [
            { code: 'ALT', display_name: 'Alanine aminotransferase' },
            { code: 'AST', display_name: 'Aspartate aminotransferase' },
          ],
          adds: [{ code: 'CRP', display_name: 'C-reactive protein' }],
        },
      ],
      labels: {
        ALT: 'Alanine aminotransferase',
        AST: 'Aspartate aminotransferase',
      },
    })

    const viewModel = buildOptimizationViewModel({
      selected: ['ALT', 'AST'],
      result: response,
      variant: 'light',
      biomarkerNames: {},
    })

    expect(viewModel.addons).toHaveLength(1)
    const addon = viewModel.addons[0]
    expect(addon.package.name).toBe('Expanded Liver Panel')
    expect(addon.upgradeCostLabel).toBe(formatCurrency(12))
    expect(addon.estimatedTotalLabel).toBe(formatCurrency(52))
    expect(addon.adds[0]?.code).toBe('CRP')
  })
})
