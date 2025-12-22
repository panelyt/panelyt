import { renderHook, waitFor } from '@testing-library/react'
import { useUrlParamSync } from '../useUrlParamSync'
import { useRouter } from 'next/navigation'

vi.mock('../lib/http', () => ({
  getJson: vi.fn(),
  extractErrorMessage: vi.fn(),
}))

const useRouterMock = vi.mocked(useRouter)

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
        biomarkers: [{ code: 'A1C', display_name: 'A1C' }],
      },
    ]

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
      { initialProps: { onLoadList: initialOnLoadList } },
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
