import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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
    lab_prices: {
      diag: 1000,
      alab: 1250,
    },
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
    useDebounceMock.mockImplementation((value: string) => value)
    mockUseCatalogSearch.mockImplementation(() => createSearchResult())
  })

  it('renders search input and action button', () => {
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    expect(screen.getByPlaceholderText('Search biomarkers')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to panel' })).toBeInTheDocument()
  })

  it('updates the query when the user types', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers')
    await user.type(input, 'ALT')

    expect(input).toHaveValue('ALT')
  })

  it('renders biomarker suggestions when available', () => {
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers'), {
      target: { value: 'AL' },
    })

    expect(screen.getByText('Alanine aminotransferase')).toBeInTheDocument()
    expect(screen.getByText('DIAG: 10,00 zł')).toBeInTheDocument()
    expect(screen.getByText('ALAB: 12,50 zł')).toBeInTheDocument()
  })

  it('calls onSelect when a biomarker suggestion is clicked', async () => {
    const user = userEvent.setup()
    mockUseCatalogSearch.mockImplementation(() =>
      createSearchResult({ data: { results: [biomarkerSuggestion] } }),
    )

    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers'), {
      target: { value: 'ALT' },
    })

    await user.click(screen.getByText('Alanine aminotransferase'))

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

    fireEvent.change(screen.getByPlaceholderText('Search biomarkers'), {
      target: { value: 'Liver' },
    })

    await user.click(screen.getByText('Liver bundle'))

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

    const input = screen.getByPlaceholderText('Search biomarkers')
    fireEvent.change(input, { target: { value: 'ALT' } })

    await screen.findByText('Alanine aminotransferase')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith({
      code: 'ALT',
      name: 'Alanine aminotransferase',
    })
  })

  it('falls back to manual entry when no suggestions exist', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(
      <SearchBox onSelect={onSelect} onTemplateSelect={onTemplateSelect} />,
    )

    const input = screen.getByPlaceholderText('Search biomarkers')
    await user.type(input, 'custom')
    await user.click(screen.getByRole('button', { name: 'Add to panel' }))

    expect(onSelect).toHaveBeenCalledWith({ code: 'CUSTOM', name: 'custom' })
  })
})
