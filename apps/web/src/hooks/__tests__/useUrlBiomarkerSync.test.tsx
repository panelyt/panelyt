import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { useUrlBiomarkerSync, type SelectedBiomarker } from '../useUrlBiomarkerSync'
import { useRouter } from '../../i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { postParsedJson } from '../../lib/http'

vi.mock('../../i18n/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}))

vi.mock('../../lib/http', () => ({
  postParsedJson: vi.fn(),
}))

let institutionId = 1135

vi.mock('../useInstitution', () => ({
  useInstitution: () => ({ institutionId, label: null, setInstitution: vi.fn() }),
}))

const useRouterMock = vi.mocked(useRouter)
const useSearchParamsMock = vi.mocked(useSearchParams)
const postParsedJsonMock = vi.mocked(postParsedJson)

describe('useUrlBiomarkerSync', () => {
  beforeEach(() => {
    institutionId = 1135
    window.history.pushState({}, '', '/')
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    )
    postParsedJsonMock.mockReset()
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
    expect(postParsedJsonMock).not.toHaveBeenCalled()
  })

  it('loads biomarker codes immediately before resolving names', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('biomarkers=TSH,T4') as ReturnType<typeof useSearchParams>,
    )
    const onLoadFromUrl = vi.fn()
    const resolvers: Array<(value: unknown) => void> = []

    postParsedJsonMock.mockImplementation(
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
    expect(postParsedJsonMock).toHaveBeenCalledWith(
      '/catalog/biomarkers/batch?institution=1135',
      expect.anything(),
      { codes: ['TSH', 'T4'] },
    )

    resolvers[0]?.({
      results: {
        TSH: {
          id: 11,
          name: 'Thyroid Stimulating Hormone',
          elab_code: 'TSH',
          slug: 'tsh',
          price_now_grosz: 1200,
        },
        T4: {
          id: 12,
          name: 'Thyroxine',
          elab_code: 'T4',
          slug: 't4',
          price_now_grosz: 800,
        },
      },
    })

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(2))
    expect(onLoadFromUrl.mock.calls[1]?.[0]).toEqual([
      { code: 'TSH', name: 'Thyroid Stimulating Hormone' },
      { code: 'T4', name: 'Thyroxine' },
    ])
  })

  it('resolves biomarker names after fallback even when selection updates', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('biomarkers=124') as ReturnType<typeof useSearchParams>,
    )
    const onLoadFromUrl = vi.fn()
    const resolvers: Array<(value: unknown) => void> = []

    postParsedJsonMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )

    renderHook(() => {
      const [selected, setSelected] = useState<SelectedBiomarker[]>([])
      const handleLoad = useCallback((biomarkers: SelectedBiomarker[]) => {
        onLoadFromUrl(biomarkers)
        setSelected(biomarkers)
      }, [])

      return useUrlBiomarkerSync({
        selected,
        onLoadFromUrl: handleLoad,
      })
    })

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(1))
    expect(onLoadFromUrl).toHaveBeenCalledWith([{ code: '124', name: '124' }])
    expect(postParsedJsonMock).toHaveBeenCalledWith(
      '/catalog/biomarkers/batch?institution=1135',
      expect.anything(),
      { codes: ['124'] },
    )

    resolvers[0]?.({
      results: {
        124: {
          id: 1,
          name: 'Testosterone',
          elab_code: '124',
          slug: 'testosterone',
          price_now_grosz: 1000,
        },
      },
    })

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(2))
    expect(onLoadFromUrl.mock.calls[1]?.[0]).toEqual([
      { code: '124', name: 'Testosterone' },
    ])
  })

  it('retries name lookup when institution changes and fallback remains unresolved', async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('biomarkers=TSH') as ReturnType<typeof useSearchParams>,
    )
    const onLoadFromUrl = vi.fn()

    postParsedJsonMock.mockImplementation((path) => {
      if (path.includes('institution=1135')) {
        return Promise.resolve({
          results: {
            TSH: null,
          },
        })
      }
      return Promise.resolve({
        results: {
          TSH: {
            id: 11,
            name: 'Thyroid Stimulating Hormone',
            elab_code: 'TSH',
            slug: 'tsh',
            price_now_grosz: 1200,
          },
        },
      })
    })

    const { rerender } = renderHook(() => {
      const [selected, setSelected] = useState<SelectedBiomarker[]>([])
      const handleLoad = useCallback((biomarkers: SelectedBiomarker[]) => {
        onLoadFromUrl(biomarkers)
        setSelected(biomarkers)
      }, [])

      return useUrlBiomarkerSync({
        selected,
        onLoadFromUrl: handleLoad,
      })
    })

    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(1))
    expect(onLoadFromUrl).toHaveBeenCalledWith([{ code: 'TSH', name: 'TSH' }])

    institutionId = 2001
    rerender()

    await waitFor(() => expect(postParsedJsonMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onLoadFromUrl).toHaveBeenCalledTimes(2))
    expect(onLoadFromUrl.mock.calls[1]?.[0]).toEqual([
      { code: 'TSH', name: 'Thyroid Stimulating Hormone' },
    ])
  })
})
