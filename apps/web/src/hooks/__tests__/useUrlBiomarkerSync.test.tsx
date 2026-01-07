import { act, renderHook } from '@testing-library/react'
import { useUrlBiomarkerSync, type SelectedBiomarker } from '../useUrlBiomarkerSync'
import { useRouter } from '../../i18n/navigation'

vi.mock('../../i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

const useRouterMock = vi.mocked(useRouter)

describe('useUrlBiomarkerSync', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('includes locale prefix when building share url', () => {
    const origin = window.location.origin
    const { result } = renderHook(() =>
      useUrlBiomarkerSync({
        selected: [{ code: 'A1C', name: 'A1C' }],
        onLoadFromUrl: vi.fn(),
        skipSync: true,
        locale: 'en',
      }),
    )

    expect(result.current.getShareUrl()).toBe(`${origin}/en?biomarkers=A1C`)
  })

  it('keeps default locale share url without prefix', () => {
    const origin = window.location.origin
    const { result } = renderHook(() =>
      useUrlBiomarkerSync({
        selected: [{ code: 'A1C', name: 'A1C' }],
        onLoadFromUrl: vi.fn(),
        skipSync: true,
        locale: 'pl',
      }),
    )

    expect(result.current.getShareUrl()).toBe(`${origin}/?biomarkers=A1C`)
  })

  it('updates the url with locale prefix when selection changes', () => {
    vi.useFakeTimers()
    const replace = vi.fn()
    useRouterMock.mockReturnValue({
      push: vi.fn(),
      replace,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })

    const { rerender } = renderHook(
      ({ selected }: { selected: SelectedBiomarker[] }) =>
        useUrlBiomarkerSync({
          selected,
          onLoadFromUrl: vi.fn(),
          locale: 'en',
        }),
      { initialProps: { selected: [] as SelectedBiomarker[] } },
    )

    rerender({ selected: [{ code: 'A1C', name: 'A1C' }] })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(replace).toHaveBeenCalledWith('/en?biomarkers=A1C', { scroll: false })
    vi.useRealTimers()
  })
})
