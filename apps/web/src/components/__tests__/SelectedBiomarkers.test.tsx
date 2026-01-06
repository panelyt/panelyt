import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { SelectedBiomarkers } from '../selected-biomarkers'
import { renderWithIntl } from '../../test/utils'

describe('SelectedBiomarkers', () => {
  const mockOnRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no biomarkers are selected', () => {
    renderWithIntl(<SelectedBiomarkers biomarkers={[]} onRemove={mockOnRemove} />)

    expect(
      screen.getByText(
        /Add biomarkers to compare prices across single tests and bundles/i,
      ),
    ).toBeInTheDocument()
  })

  it('renders selected biomarkers with name and code', () => {
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CHOL', name: 'Total cholesterol' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Aspartate aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Total cholesterol')).toBeInTheDocument()

    expect(screen.getByText('ALT')).toBeInTheDocument()
    expect(screen.getByText('AST')).toBeInTheDocument()
    expect(screen.getByText('CHOL')).toBeInTheDocument()
  })

  it('renders a remove button with an accessible label', () => {
    const biomarkers = [{ code: 'ALT', name: 'Alanine aminotransferase' }]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
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
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const removeButton = screen.getByRole('button', {
      name: /Remove Alanine aminotransferase/i,
    })
    await user.click(removeButton)

    expect(mockOnRemove).toHaveBeenCalledWith('ALT')
  })

  it('keeps the code in a monospace style element', () => {
    const biomarkers = [{ code: 'ALT', name: 'Alanine aminotransferase' }]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const code = screen.getByText('ALT')
    expect(code).toHaveClass('font-mono')
  })
})
