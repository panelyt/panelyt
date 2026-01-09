import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'
import { SearchBox } from '../search-box'
import { renderWithQueryClient } from '../../test/utils'

const useDebounceMock = vi.hoisted(() =>
  vi.fn<(value: string, delay?: number) => string>((value) => value),
)
vi.mock('../../hooks/useDebounce', () => ({
  useDebounce: useDebounceMock,
}))

vi.mock('../../hooks/useCatalogSearch', () => ({
  useCatalogSearch: vi.fn(),
}))

import { useCatalogSearch } from '../../hooks/useCatalogSearch'

const mockUseCatalogSearch = vi.mocked(useCatalogSearch)

const createSearchResult = (
  overrides: Partial<ReturnType<typeof useCatalogSearch>> = {},
) =>
  ({
    data: undefined,
    isFetching: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useCatalogSearch>)

describe('SearchBox', () => {
  const biomarkerSuggestion = {
    type: 'biomarker' as const,
    id: 1,
    name: 'Alanine aminotransferase',
    elab_code: 'ALT',
    slug: 'alt',
    price_now_grosz: 1000,
  }

  const templateSuggestion = {
    type: 'template' as const,
    id: 42,
    slug: 'liver-bundle',
    name: 'Liver bundle',
    description: 'Daily liver health insights',
    biomarker_count: 4,
  }

  const onSelect = vi.fn()
  const onTemplateSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    useDebounceMock.mockImplementation((value: string) => value)
    mockUseCatalogSearch.mockImplementation(() => createSearchResult())
  })

  afterEach(() => {
    delete document.body.dataset.searchHotkeyScope
  })

  it('renders the search input', () => {
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    expect(
      screen.getByRole('combobox', { name: 'Search biomarkers to add...' }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search biomarkers to add...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to panel' })).not.toBeInTheDocument()
  })

  it('updates the query when the user types', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers to add...')
    await user.type(input, 'ALT')

    expect(input).toHaveValue('ALT')
  })

  it('renders grouped suggestions when available', () => {
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({
        data: { results: [biomarkerSuggestion, templateSuggestion] },
      }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers to add...'), {
      target: { value: 'AL' },
    })

    expect(screen.getByText('Biomarkers')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('10,00 zł')).toBeInTheDocument()
    expect(screen.getByText('Liver bundle')).toBeInTheDocument()
  })

  it('calls onSelect when a biomarker suggestion is clicked', async () => {
    const user = userEvent.setup()
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers to add...'), {
      target: { value: 'ALT' },
    })

    await user.click(
      screen.getByRole('option', { name: /Alanine aminotransferase/ }),
    )

    expect(onSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
    expect(onTemplateSelect).not.toHaveBeenCalled()
  })

  it('calls onTemplateSelect when a template suggestion is clicked', async () => {
    const user = userEvent.setup()
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [templateSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers to add...'), {
      target: { value: 'Liver' },
    })

    await user.click(screen.getByRole('option', { name: /Liver bundle/ }))

    expect(onTemplateSelect).toHaveBeenCalledWith({
      slug: 'liver-bundle',
      name: 'Liver bundle',
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('pressing Enter selects the highlighted suggestion', async () => {
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers to add...')
    fireEvent.change(input, { target: { value: 'ALT' } })

    await screen.findByText('Alanine aminotransferase')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('pressing Enter selects the top suggestion when none is highlighted', async () => {
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers to add...')
    fireEvent.change(input, { target: { value: 'ALT' } })
    await screen.findByText('Alanine aminotransferase')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('shows a hint and does nothing when Enter is pressed without suggestions', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers to add...')
    await user.type(input, 'custom')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(onTemplateSelect).not.toHaveBeenCalled()
    expect(screen.getByText('Select a suggestion to add it.')).toBeInTheDocument()
  })

  it('focuses the search input when pressing "/" outside of inputs', () => {
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByRole('combobox')
    expect(input).not.toHaveFocus()

    fireEvent.keyDown(window, { key: '/' })

    expect(input).toHaveFocus()
  })

  it('does not steal focus when typing in another input', () => {
    renderWithQueryClient(
      <div>
        <input aria-label="Other input" />
        <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />
      </div>,
    )

    const otherInput = screen.getByLabelText('Other input')
    otherInput.focus()

    fireEvent.keyDown(otherInput, { key: '/' })

    expect(otherInput).toHaveFocus()
  })

  it('skips the "/" hotkey when a different scope is active', () => {
    document.body.dataset.searchHotkeyScope = 'panel-tray'
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByRole('combobox')

    fireEvent.keyDown(window, { key: '/' })

    expect(input).not.toHaveFocus()
  })

  it('focuses when the active scope matches', () => {
    document.body.dataset.searchHotkeyScope = 'panel-tray'
    renderWithQueryClient(
      <SearchBox
        onSelect={onSelect}
        onTemplateSelect={onTemplateSelect}
        hotkeyScope="panel-tray"
      />,
    )

    const input = screen.getByRole('combobox')

    fireEvent.keyDown(window, { key: '/' })

    expect(input).toHaveFocus()
  })

  it('hides the inline hint after a successful add and keeps it hidden for the session', async () => {
    const user = userEvent.setup()
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    const { unmount } = renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    expect(screen.getByText('Enter')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers to add...'), {
      target: { value: 'ALT' },
    })
    await user.click(
      await screen.findByRole('option', { name: /Alanine aminotransferase/ }),
    )

    expect(screen.queryByText('Enter')).not.toBeInTheDocument()

    unmount()

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    expect(screen.queryByText('Enter')).not.toBeInTheDocument()
  })
})
