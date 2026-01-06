import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      missing: { count: 2, tokens: ['ALT', 'AST'] },
      coversAll: false,
    },
  ]

  it('marks the active lab and exposes missing details with a tooltip', async () => {
    const user = userEvent.setup()
    renderTabs()

    const region = screen.getByRole('region', { name: /best prices/i })
    const segments = within(region).getAllByRole('tab')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveAttribute('aria-selected', 'true')
    expect(segments[1]).toHaveAttribute('aria-selected', 'false')

    expect(within(region).getByText('Save $12')).toBeInTheDocument()
    const missingChip = within(region).getByText('Missing 2')
    expect(missingChip).toBeInTheDocument()

    await user.hover(missingChip)

    await waitFor(() => {
      expect(document.body.textContent).toContain('Missing biomarkers')
      expect(document.body.textContent).toContain('ALT')
      expect(document.body.textContent).toContain('AST')
    })
  })
})
