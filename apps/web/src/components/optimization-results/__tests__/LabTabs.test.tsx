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
      badge: 'Cheapest',
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

  it('renders the badge inline without placeholder spacing', () => {
    renderTabs()

    const region = screen.getByRole('region', { name: /best prices/i })
    const badge = within(region).getByText('Cheapest')
    const labName = within(region).getByText('DIAG')
    const nameRow = badge.parentElement

    expect(nameRow).not.toBeNull()
    expect(nameRow).toHaveClass('flex')
    expect(nameRow).toHaveClass('items-center')
    expect(nameRow).not.toHaveClass('flex-col')
    expect(nameRow).toContainElement(labName)
    expect(within(region).queryByText('badge')).not.toBeInTheDocument()
  })

  it('uses an outline-only highlight for the selected lab', () => {
    renderTabs()

    const region = screen.getByRole('region', { name: /best prices/i })
    const tablist = within(region).getByRole('tablist')
    const [activeTab] = within(region).getAllByRole('tab')

    expect(tablist).toHaveClass('border-0')
    expect(activeTab).not.toHaveClass('bg-accent-cyan')
    expect(tablist).not.toHaveClass('[&>button[aria-selected=true]]:bg-accent-cyan/10')
    expect(tablist).not.toHaveClass('[&>button]:border')
    expect(tablist).not.toHaveClass('[&>button]:border-transparent')
    expect(tablist).not.toHaveClass('[&>button[aria-selected=true]]:border-accent-cyan/40')
    expect(tablist).toHaveClass('[&>button[aria-selected=true]]:ring-accent-cyan/40')
  })

  it('stacks the price above the chips without bottom pinning', () => {
    renderTabs()

    const region = screen.getByRole('region', { name: /best prices/i })
    const tablist = within(region).getByRole('tablist')

    expect(tablist).toHaveClass('[&>button]:min-h-[104px]')

    const price = within(region).getByText('$25.00')
    const priceRow = price.closest('div')

    expect(priceRow).not.toBeNull()
    expect(priceRow).toHaveClass('mt-2')
    expect(priceRow).toHaveClass('justify-end')

    const savingsChip = within(region).getByText('Save $12')
    const chipsRow = savingsChip.closest('div')

    expect(chipsRow).not.toBeNull()
    expect(chipsRow).not.toHaveClass('mt-auto')
    expect(chipsRow).toHaveClass('mt-2')
  })
})
