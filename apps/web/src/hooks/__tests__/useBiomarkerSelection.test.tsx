import { renderHook, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { useBiomarkerSelection } from '../useBiomarkerSelection'
import plMessages from '../../i18n/messages/pl.json'

const STORAGE_KEY = 'panelyt:selected-biomarkers'

const createWrapper = () => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="pl" messages={plMessages}>
        {children}
      </NextIntlClientProvider>
    )
  }
}

describe('useBiomarkerSelection', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('uses Polish notices when addons add no new biomarkers', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleSelect({ code: 'ALT', name: 'ALT' })
    })

    act(() => {
      result.current.handleApplyAddon([{ code: 'ALT', name: 'ALT' }], 'Liver Panel')
    })

    expect(result.current.notice?.message).toBe(
      plMessages.selection.alreadySelected.replace('{name}', 'Liver Panel'),
    )
  })

  describe('sessionStorage persistence', () => {
    it('persists selection to sessionStorage when biomarkers are added', () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      act(() => {
        result.current.handleSelect({ code: 'ALT', name: 'ALT' })
      })

      const stored = sessionStorage.getItem(STORAGE_KEY)
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed).toEqual([{ code: 'ALT', name: 'ALT' }])
    })

    it('restores selection from sessionStorage on mount', () => {
      const existingSelection = [
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ]
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existingSelection))

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual(existingSelection)
    })

    it('survives component remount (simulating locale switch)', () => {
      const wrapper = createWrapper()

      // First mount: add some biomarkers
      const { result, unmount } = renderHook(() => useBiomarkerSelection(), { wrapper })

      act(() => {
        result.current.handleSelect({ code: 'ALT', name: 'ALT' })
        result.current.handleSelect({ code: 'AST', name: 'AST' })
      })

      expect(result.current.selected).toHaveLength(2)

      // Unmount (simulating locale switch causing remount)
      unmount()

      // Second mount: should restore from storage
      const { result: result2 } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result2.current.selected).toEqual([
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ])
    })

    it('handles invalid JSON in sessionStorage gracefully', () => {
      sessionStorage.setItem(STORAGE_KEY, 'not valid json')

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([])
    })

    it('handles non-array data in sessionStorage gracefully', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([])
    })

    it('filters out malformed entries from sessionStorage', () => {
      const mixedData = [
        { code: 'ALT', name: 'ALT' }, // valid
        { code: 123, name: 'Invalid' }, // invalid code type
        { code: 'MISSING_NAME' }, // missing name
        null, // null entry
        { code: 'AST', name: 'AST' }, // valid
      ]
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mixedData))

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ])
    })

    it('updates sessionStorage when biomarkers are removed', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { code: 'ALT', name: 'ALT' },
          { code: 'AST', name: 'AST' },
        ])
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      act(() => {
        result.current.handleRemove('ALT')
      })

      const stored = sessionStorage.getItem(STORAGE_KEY)
      expect(JSON.parse(stored!)).toEqual([{ code: 'AST', name: 'AST' }])
    })
  })
})
