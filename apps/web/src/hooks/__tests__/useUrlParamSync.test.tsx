import { renderHook, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { useUrlParamSync } from '../useUrlParamSync'
import { useRouter } from '../../i18n/navigation'
import enMessages from '../../i18n/messages/en.json'

vi.mock('../lib/http', () => ({
  getJson: vi.fn(),
  extractErrorMessage: vi.fn(),
}))

vi.mock('../../i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

const useRouterMock = vi.mocked(useRouter)

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
    window.history.pushState({}, '', '/?list=list-1')
  })

  it('loads a list only once per list id even when callbacks change', async () => {
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
})
