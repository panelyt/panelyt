import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { SearchBox } from '../search-box'

// Mock the hooks
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: vi.fn((value) => value), // Return value immediately for testing
}))

vi.mock('../../hooks/useBiomarkerSearch', () => ({
  useBiomarkerSearch: vi.fn(),
}))

import { useBiomarkerSearch } from '../../hooks/useBiomarkerSearch'

const mockUseBiomarkerSearch = vi.mocked(useBiomarkerSearch)

const createSearchResult = (
  overrides: Partial<ReturnType<typeof useBiomarkerSearch>> = {},
) =>
  ({
    data: undefined,
    isFetching: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useBiomarkerSearch>)

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('SearchBox', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseBiomarkerSearch.mockReturnValue(createSearchResult())
  })

  it('renders search input and add button', () => {
    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    expect(screen.getByPlaceholderText('Search biomarkers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to panel' })).toBeInTheDocument()
  })

  it('updates input value when user types', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    await user.type(input, 'ALT')

    expect(input).toHaveValue('ALT')
  })

  it('shows suggestions when available', () => {
    const mockResults = [
      { id: 1, name: 'Alanine aminotransferase', elab_code: 'ALT', slug: 'alt' },
      { id: 2, name: 'Aspartate aminotransferase', elab_code: 'AST', slug: 'ast' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    // Type to trigger suggestions
    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'AL' } })

    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('Aspartate aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('ALT')).toBeInTheDocument()
    expect(screen.getByText('AST')).toBeInTheDocument()
  })

  it('calls onSelect when suggestion is clicked', async () => {
    const user = userEvent.setup()
    const mockResults = [
      { id: 1, name: 'Alanine aminotransferase', elab_code: 'ALT', slug: 'alt' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    // Type to show suggestions
    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'AL' } })

    // Click on suggestion
    const suggestion = screen.getByText('Alanine aminotransferase')
    await user.click(suggestion)

    expect(mockOnSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('calls onSelect when Enter is pressed with suggestion highlighted', async () => {
    const user = userEvent.setup()
    const mockResults = [
      { id: 1, name: 'Alanine aminotransferase', elab_code: 'ALT', slug: 'alt' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'AL' } })

    // Navigate to first suggestion with arrow down
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(mockOnSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('navigates suggestions with arrow keys', async () => {
    const user = userEvent.setup()
    const mockResults = [
      { id: 1, name: 'Alanine aminotransferase', elab_code: 'ALT', slug: 'alt' },
      { id: 2, name: 'Aspartate aminotransferase', elab_code: 'AST', slug: 'ast' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'A' } })

    // First suggestion should be highlighted after arrow down
    await user.keyboard('{ArrowDown}')

    // Check if first suggestion has highlighted styling
    const firstSuggestion = screen.getByText('Alanine aminotransferase').closest('button')
    expect(firstSuggestion).toHaveClass('bg-brand', 'text-white')

    // Navigate to second suggestion
    await user.keyboard('{ArrowDown}')

    // Second suggestion should now be highlighted
    const secondSuggestion = screen.getByText('Aspartate aminotransferase').closest('button')
    expect(secondSuggestion).toHaveClass('bg-brand', 'text-white')

    // Navigate back up
    await user.keyboard('{ArrowUp}')

    // First suggestion should be highlighted again
    expect(firstSuggestion).toHaveClass('bg-brand', 'text-white')
  })

  it('clears input and calls onSelect when Add button is clicked', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    await user.type(input, 'CUSTOM')

    const addButton = screen.getByRole('button', { name: 'Add to panel' })
    await user.click(addButton)

    expect(mockOnSelect).toHaveBeenCalledWith({
      code: 'CUSTOM',
      name: 'CUSTOM',
    })
    expect(input).toHaveValue('')
  })

  it('clears input when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    await user.type(input, 'TEST')
    expect(input).toHaveValue('TEST')

    await user.keyboard('{Escape}')
    expect(input).toHaveValue('')
  })

  it('shows loading indicator when fetching', () => {
    mockUseBiomarkerSearch.mockReturnValue(createSearchResult({ isFetching: true }))

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    expect(screen.getByText('Searching…')).toBeInTheDocument()
  })

  it('uses first suggestion when Enter is pressed without navigation', async () => {
    const user = userEvent.setup()
    const mockResults = [
      { id: 1, name: 'Alanine aminotransferase', elab_code: 'ALT', slug: 'alt' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'AL' } })

    await user.keyboard('{Enter}')

    expect(mockOnSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('handles biomarkers without elab_code', async () => {
    const user = userEvent.setup()
    const mockResults = [
      { id: 1, name: 'Custom Test', elab_code: null, slug: 'custom-test' },
    ]

    mockUseBiomarkerSearch.mockReturnValue(
      createSearchResult({ data: { results: mockResults } }),
    )

    renderWithQueryClient(<SearchBox onSelect={mockOnSelect} />)

    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'custom' } })

    const suggestion = screen.getByText('Custom Test')
    await user.click(suggestion)

    expect(mockOnSelect).toHaveBeenCalledWith({
      code: 'custom-test', // Falls back to slug
      name: 'Custom Test',
    })
  })
})
