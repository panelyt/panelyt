import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { SelectedBiomarkers } from '../selected-biomarkers'
import { renderWithIntl } from '../../test/utils'

describe('SelectedBiomarkers', () => {
  const mockOnRemove = vi.fn()
  const mockOnClearAll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no biomarkers are selected', () => {
    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={[]}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    expect(
      screen.getByText(
        /Add biomarkers to compare prices across single tests and bundles/i,
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

    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Aspartate aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Total cholesterol')).toBeInTheDocument()

    expect(screen.queryByText('ALT')).not.toBeInTheDocument()
    expect(screen.queryByText('AST')).not.toBeInTheDocument()
    expect(screen.queryByText('CHOL')).not.toBeInTheDocument()
  })

  it('renders a remove button with an accessible label', () => {
    const biomarkers = [{ code: 'ALT', name: 'Alanine aminotransferase' }]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Remove Alanine aminotransferase/i }),
    ).toBeInTheDocument()
  })

  it('calls onRemove when remove button is clicked', async () => {
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

    const removeButton = screen.getByRole('button', {
      name: /Remove Alanine aminotransferase/i,
    })
    await user.click(removeButton)

    expect(mockOnRemove).toHaveBeenCalledWith('ALT')
  })

  it('opens the clear all dialog and confirms removal', async () => {
    const user = userEvent.setup()
    const biomarkers = [{ code: 'ALT', name: 'Alanine aminotransferase' }]

    renderWithIntl(
      <SelectedBiomarkers
        biomarkers={biomarkers}
        onRemove={mockOnRemove}
        onClearAll={mockOnClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Clear all/i }))

    expect(screen.getByText(/Clear all biomarkers\?/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Yes, clear/i }))

    expect(mockOnClearAll).toHaveBeenCalledTimes(1)
  })
})
