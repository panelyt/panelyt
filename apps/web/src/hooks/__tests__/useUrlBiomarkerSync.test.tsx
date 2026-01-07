import { renderHook } from '@testing-library/react'
import { useUrlBiomarkerSync } from '../useUrlBiomarkerSync'

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
})
