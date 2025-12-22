import { screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { LabTabs } from '../lab-tabs'
import { renderWithIntl } from '../../../test/utils'

describe('LabTabs', () => {
  const renderTabs = () =>
    renderWithIntl(<LabTabs labCards={baseCards} isDark={false} />)

  const baseCards = [
    {
      key: 'diag',
      title: 'ONLY DIAG',
      priceLabel: '$25.00',
      active: true,
      loading: false,
      disabled: false,
      onSelect: vi.fn(),
      icon: null,
      accentLight: '',
      accentDark: '',
      savings: { amount: 12, label: '$12' },
    },
    {
      key: 'alab',
      title: 'ONLY ALAB',
      priceLabel: '$27.00',
      active: false,
      loading: false,
      disabled: false,
      onSelect: vi.fn(),
      icon: null,
      accentLight: '',
      accentDark: '',
      missing: { count: 2 },
      coversAll: false,
    },
  ]

  it('marks the active lab as pressed and surfaces savings/missing details', () => {
    renderTabs()

    const region = screen.getByRole('region', { name: /best prices/i })
    const segments = within(region).getAllByRole('button')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveAttribute('aria-pressed', 'true')
    expect(segments[1]).toHaveAttribute('aria-pressed', 'false')

    expect(within(region).getByText('Save $12')).toBeInTheDocument()
    expect(within(region).getByText('Missing 2')).toBeInTheDocument()
  })
})
