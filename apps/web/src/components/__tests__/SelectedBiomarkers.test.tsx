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

  it('renders selected biomarkers as removable buttons', () => {
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

    // All biomarkers should be rendered as buttons
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('calls onRemove when biomarker button is clicked', async () => {
    const user = userEvent.setup()
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const altButton = screen.getByRole('button', { name: /Alanine aminotransferase/ })
    await user.click(altButton)

    expect(mockOnRemove).toHaveBeenCalledWith('ALT')
  })

  it('shows proper title attribute for remove functionality', () => {
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const button = screen.getByRole('button', { name: /Alanine aminotransferase/ })
    expect(button).toHaveAttribute('title', 'Remove Alanine aminotransferase')
  })

  it('applies correct CSS classes for styling', () => {
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const button = screen.getByRole('button', { name: /Alanine aminotransferase/ })
    expect(button).toHaveClass(
      'group',
      'inline-flex',
      'items-center',
      'gap-2',
      'rounded-full',
      'border',
      'border-emerald-400/40',
      'bg-emerald-400/15',
      'px-3',
      'py-1.5',
      'text-xs',
      'font-semibold',
      'text-emerald-200',
      'transition',
    )
  })

  it('handles duplicate codes correctly', async () => {
    const user = userEvent.setup()
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'ALT', name: 'ALT (duplicate)' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    // Both should be rendered
    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('ALT (duplicate)')).toBeInTheDocument()

    // Click on first one
    const firstButton = screen.getByText('Alanine aminotransferase')
    await user.click(firstButton)

    expect(mockOnRemove).toHaveBeenCalledWith('ALT')
  })

  it('renders with flexbox layout for responsive design', () => {
    const biomarkers = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]

    renderWithIntl(
      <SelectedBiomarkers biomarkers={biomarkers} onRemove={mockOnRemove} />,
    )

    const container = screen.getByRole('button', { name: /Alanine aminotransferase/ }).closest('div')
    expect(container).toHaveClass('flex', 'flex-wrap', 'gap-2')

    expect(screen.queryByText('ALT', { exact: true })).not.toBeInTheDocument()
  })
})
