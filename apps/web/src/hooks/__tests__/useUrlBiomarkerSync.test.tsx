import { act, renderHook, waitFor } from '@testing-library/react'
import { useUrlBiomarkerSync, type SelectedBiomarker } from '../useUrlBiomarkerSync'
import { useRouter } from '../../i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { getJson } from '../../lib/http'

vi.mock('../../i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}))

vi.mock('../../lib/http', () => ({
  getJson: vi.fn(),
}))

const useRouterMock = vi.mocked(useRouter)
const useSearchParamsMock = vi.mocked(useSearchParams)
const getJsonMock = vi.mocked(getJson)

describe('useUrlBiomarkerSync', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    )
    getJsonMock.mockReset()
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

  it('updates the url without duplicating the locale prefix when selection changes', () => {
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

    expect(replace).toHaveBeenCalledWith('/?biomarkers=A1C', { scroll: false })
    vi.useRealTimers()
  })

  it('keeps existing selection when url codes match selected', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('biomarkers=TSH,T4') as ReturnType<typeof useSearchParams>,
    )
    const onLoadFromUrl = vi.fn()

    renderHook(() =>
      useUrlBiomarkerSync({
        selected: [
          { code: 'TSH', name: 'Thyroid Stimulating Hormone' },
          { code: 'T4', name: 'Thyroxine' },
        ],
        onLoadFromUrl,
      }),
    )

    await waitFor(() => expect(onLoadFromUrl).not.toHaveBeenCalled())
    expect(getJsonMock).not.toHaveBeenCalled()
  })

  it('loads biomarker codes immediately before resolving names', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('biomarkers=TSH,T4') as ReturnType<typeof useSearchParams>,
    )
    const onLoadFromUrl = vi.fn()
    const resolvers: Array<(value: unknown) => void> = []

    getJsonMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )

    renderHook(() =>
      useUrlBiomarkerSync({
        selected: [],
        onLoadFromUrl,
      }),
    )

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(1))
    expect(onLoadFromUrl).toHaveBeenCalledWith([
      { code: 'TSH', name: 'TSH' },
      { code: 'T4', name: 'T4' },
    ])

    resolvers[0]?.({
      results: [{ name: 'Thyroid Stimulating Hormone', elab_code: 'TSH', slug: 'tsh' }],
    })
    resolvers[1]?.({ results: [{ name: 'Thyroxine', elab_code: 'T4', slug: 't4' }] })

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(2))
    expect(onLoadFromUrl.mock.calls[1]?.[0]).toEqual([
      { code: 'TSH', name: 'Thyroid Stimulating Hormone' },
      { code: 'T4', name: 'Thyroxine' },
    ])
  })
})
