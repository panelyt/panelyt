import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { SelectedBiomarkers } from '../selected-biomarkers'
import { renderWithIntl } from '../../test/utils'
import enMessages from '../../i18n/messages/en.json'

describe('SelectedBiomarkers', () => {
  const mockOnRemove = vi.fn()
  const mockOnClearAll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the selected count and disables clear all when empty', () => {
    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={[]}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    expect(screen.getByText('Selected (0)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear all/i })).toBeDisabled()
    expect(
      screen.getByText(
        /Add tests to compare prices across single tests and bundles/i,
      ),
    ).toBeInTheDocument()
  })

  it('renders selected biomarkers with names only', () => {
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CHOL', name: 'Total cholesterol' },
    ]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    expect(screen.getByText('Selected (3)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear all/i })).toBeEnabled()
    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Aspartate aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Total cholesterol')).toBeInTheDocument()

    expect(screen.queryByText('ALT')).not.toBeInTheDocument()
    expect(screen.queryByText('AST')).not.toBeInTheDocument()
    expect(screen.queryByText('CHOL')).not.toBeInTheDocument()
  })

  it('highlights newly added biomarkers without re-highlighting existing chips', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
      </NextIntlClientProvider>
    )
    const { rerender } = render(
      <SelectedBiomarkers
        biomarkers={[{ code: 'ALT', name: 'Alanine aminotransferase' }]}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
      { wrapper },
    )

    const initialChip = screen.getByRole('button', {
      name: /Remove Alanine aminotransferase/i,
    })
    expect(initialChip).not.toHaveClass('motion-safe:animate-[pulse_1.2s_ease-out_1]')

    rerender(
      <SelectedBiomarkers
        biomarkers={[
          { code: 'ALT', name: 'Alanine aminotransferase' },
          { code: 'AST', name: 'Aspartate aminotransferase' },
        ]}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    const newChip = screen.getByRole('button', {
      name: /Remove Aspartate aminotransferase/i,
    })

    await waitFor(() => {
      expect(newChip).toHaveClass('motion-safe:animate-[pulse_1.2s_ease-out_1]')
      expect(
        screen.getByRole('button', {
          name: /Remove Alanine aminotransferase/i,
        }),
      ).not.toHaveClass('motion-safe:animate-[pulse_1.2s_ease-out_1]')
    })
  })


  it('removes a biomarker when clicking the pill text', async () => {
    const user = userEvent.setup()
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    await user.click(screen.getByText('Alanine aminotransferase'))

    expect(mockOnRemove).toHaveBeenCalledWith('ALT')
  })

  it('clears immediately when three or fewer biomarkers are selected', async () => {
    const user = userEvent.setup()
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CHOL', name: 'Total cholesterol' },
    ]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Clear all/i }))

    expect(screen.queryByText(/Clear all tests\?/i)).not.toBeInTheDocument()
    expect(mockOnClearAll).toHaveBeenCalledTimes(1)
  })

  it('opens the clear all dialog when more than three biomarkers are selected', async () => {
    const user = userEvent.setup()
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CHOL', name: 'Total cholesterol' },
      { code: 'CRP', name: 'C-reactive protein' },
    ]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Clear all/i }))

    expect(screen.getByText(/Clear all tests\?/i)).toBeInTheDocument()
    expect(mockOnClearAll).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Yes, clear/i }))

    expect(mockOnClearAll).toHaveBeenCalledTimes(1)
  })

  it('truncates long biomarker names without rendering a tooltip', () => {
    const longName =
      'Very long biomarker name that should be truncated to keep chips compact'

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={[{ code: 'LONG', name: longName }]}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    const name = screen.getByText(longName)
    expect(name).toHaveClass('truncate')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows a remove label when hovering over a pill', async () => {
    const user = userEvent.setup()
    const biomarkers = [{ code: 'ALT', name: 'Alanine aminotransferase' }]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    const pill = screen.getByRole('button', {
      name: /Remove Alanine aminotransferase/i,
    })

    expect(within(pill).queryByText('Remove')).not.toBeInTheDocument()

    await user.hover(pill)

    expect(within(pill).getByText('Remove')).toBeInTheDocument()
  })
})
