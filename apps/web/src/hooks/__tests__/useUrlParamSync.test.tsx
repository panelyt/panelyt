import { renderHook, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import type { SavedList } from '@panelyt/types'
import { useUrlParamSync } from '../useUrlParamSync'
import { useRouter } from '../../i18n/navigation'
import enMessages from '../../i18n/messages/en.json'
import { getJson } from '../../lib/http'

vi.mock('../../lib/http', () => ({
  getJson: vi.fn(),
  extractErrorMessage: vi.fn(),
}))

vi.mock('../../i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

const useRouterMock = vi.mocked(useRouter)
const getJsonMock = vi.mocked(getJson)

const createWrapper = () => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
      </NextIntlClientProvider>
    )
  }
}

describe('useUrlParamSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('keeps list params and requests auth when unauthenticated', async () => {
    window.history.pushState({}, '', '/?list=list-1')
    const replace = vi.fn()
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })

    const onRequireAuth = vi.fn()
    const onLoadList = vi.fn()
    const wrapper = createWrapper()

    renderHook(
      () =>
        useUrlParamSync({
          onLoadTemplate: vi.fn(),
          onLoadShared: vi.fn(),
          onLoadList,
          onError: vi.fn(),
          savedLists: [],
          isFetchingSavedLists: false,
          isAuthenticated: false,
          onRequireAuth,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(onRequireAuth).toHaveBeenCalledTimes(1)
    })

    expect(onLoadList).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('loads list after auth and clears the param', async () => {
    window.history.pushState({}, '', '/?list=list-1')
    const replace = vi.fn()
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })

    const onRequireAuth = vi.fn()
    const onLoadList = vi.fn()
    const wrapper = createWrapper()

    const savedLists = [
      {
        id: 'list-1',
        name: 'My list',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
        biomarkers: [
          {
            id: 'entry-1',
            code: 'A1C',
            display_name: 'A1C',
            sort_order: 1,
            biomarker_id: 1,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      },
    ]

    const { rerender } = renderHook(
      ({ isAuthenticated, lists }: { isAuthenticated: boolean; lists: SavedList[] }) =>
        useUrlParamSync({
          onLoadTemplate: vi.fn(),
          onLoadShared: vi.fn(),
          onLoadList,
          onError: vi.fn(),
          savedLists: lists,
          isFetchingSavedLists: false,
          isAuthenticated,
          onRequireAuth,
        }),
      {
        initialProps: {
          isAuthenticated: false,
          lists: [] as SavedList[],
        },
        wrapper,
      },
    )

    await waitFor(() => {
      expect(onRequireAuth).toHaveBeenCalledTimes(1)
    })
    expect(replace).not.toHaveBeenCalled()

    rerender({ isAuthenticated: true, lists: savedLists })

    await waitFor(() => {
      expect(onLoadList).toHaveBeenCalledTimes(1)
    })

    expect(replace).toHaveBeenCalledWith('/', { scroll: false })
  })

  it('loads a list only once per list id even when callbacks change', async () => {
    window.history.pushState({}, '', '/?list=list-1')
    const replace = vi.fn()
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })

    const initialOnLoadList = vi.fn()
    const nextOnLoadList = vi.fn()

    const savedLists = [
      {
        id: 'list-1',
        name: 'My list',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        share_token: null,
        shared_at: null,
        notify_on_price_drop: false,
        last_known_total_grosz: null,
        last_total_updated_at: null,
        last_notified_total_grosz: null,
        last_notified_at: null,
        biomarkers: [
          {
            id: 'entry-1',
            code: 'A1C',
            display_name: 'A1C',
            sort_order: 1,
            biomarker_id: 1,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      },
    ]

    const wrapper = createWrapper()
    const { rerender } = renderHook(
      ({ onLoadList }) =>
        useUrlParamSync({
          onLoadTemplate: vi.fn(),
          onLoadShared: vi.fn(),
          onLoadList,
          onError: vi.fn(),
          isAuthenticated: true,
          savedLists,
          isFetchingSavedLists: false,
        }),
      { initialProps: { onLoadList: initialOnLoadList }, wrapper },
    )

    await waitFor(() => {
      expect(initialOnLoadList).toHaveBeenCalledTimes(1)
    })

    rerender({ onLoadList: nextOnLoadList })

    await waitFor(() => {
      expect(initialOnLoadList).toHaveBeenCalledTimes(1)
      expect(nextOnLoadList).toHaveBeenCalledTimes(0)
    })
  })

  it('loads a template from the url and cleans the param', async () => {
    window.history.pushState({}, '', '/?template=template-1')
    const replace = vi.fn()
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })

    getJsonMock.mockResolvedValue({
      id: 1,
      slug: 'template-1',
      name: 'Starter Panel',
      description: null,
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      biomarkers: [
        {
          id: 1,
          code: 'A1C',
          display_name: 'A1C',
          sort_order: 1,
          biomarker: null,
          notes: null,
        },
      ],
    })

    const onLoadTemplate = vi.fn()
    const wrapper = createWrapper()

    renderHook(
      () =>
        useUrlParamSync({
          onLoadTemplate,
          onLoadShared: vi.fn(),
          onLoadList: vi.fn(),
          onError: vi.fn(),
          isAuthenticated: true,
          savedLists: [],
          isFetchingSavedLists: false,
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(onLoadTemplate).toHaveBeenCalledWith([{ code: 'A1C', name: 'A1C' }])
    })

    expect(getJsonMock).toHaveBeenCalledWith('/biomarker-lists/templates/template-1')
    expect(replace).toHaveBeenCalledWith('/', { scroll: false })
  })
})
