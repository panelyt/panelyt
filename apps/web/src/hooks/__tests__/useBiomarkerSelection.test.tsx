import { renderHook, act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { Toaster, toast } from 'sonner'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useBiomarkerSelection } from '../useBiomarkerSelection'
import enMessages from '../../i18n/messages/en.json'
import plMessages from '../../i18n/messages/pl.json'
import { usePanelStore, PANEL_STORAGE_KEY } from '../../stores/panelStore'
import { getJson } from '../../lib/http'

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}))

vi.mock('../../lib/http', async () => {
  const actual = await vi.importActual<typeof import('../../lib/http')>('../../lib/http')
  return {
    ...actual,
    getJson: vi.fn(),
  }
})

import { track } from '../../lib/analytics'

const trackMock = vi.mocked(track)

const readPersistedSelection = () => {
  const raw = sessionStorage.getItem(PANEL_STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw)
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && 'state' in parsed) {
    return parsed.state?.selected ?? null
  }
  return null
}

const createWrapper = () => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="pl" messages={plMessages}>
        {children}
      </NextIntlClientProvider>
    )
  }
}

const createWrapperWithToaster = () => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
        <Toaster />
      </NextIntlClientProvider>
    )
  }
}

const rehydrateStore = async () => {
  await act(async () => {
    await usePanelStore.persist.rehydrate()
  })
}

const resetStore = async () => {
  await act(async () => {
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined })
  })
  usePanelStore.persist.clearStorage()
}

describe('useBiomarkerSelection', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    await resetStore()
    await rehydrateStore()
    trackMock.mockClear()
  })

  afterEach(async () => {
    sessionStorage.clear()
    await resetStore()
    toast.dismiss()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })

  it('shows a toast when a template adds biomarkers', async () => {
    const wrapper = createWrapperWithToaster()
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })
    const mockGetJson = vi.mocked(getJson)

    mockGetJson.mockResolvedValueOnce({
      id: 101,
      slug: 'core-panel',
      name_en: 'Core Panel',
      name_pl: 'Panel podstawowy',
      description_en: null,
      description_pl: null,
      is_active: true,
      created_at: '2025-12-01T00:00:00Z',
      updated_at: '2025-12-02T00:00:00Z',
      biomarkers: [
        {
          id: 1,
          code: 'ALT',
          display_name: 'ALT',
          sort_order: 1,
          biomarker: null,
          notes: null,
        },
      ],
    })

    await act(async () => {
      await result.current.handleTemplateSelect({ slug: 'core-panel', name: 'Core Panel' })
    })

    expect(
      await screen.findByText('Added 1 test from Core Panel.'),
    ).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('panel_apply_template', { mode: 'append' })
  })

  it('shows a toast when addon biomarkers are applied', async () => {
    const wrapper = createWrapperWithToaster()
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleApplyAddon([{ code: 'ALT', name: 'ALT' }], 'Liver Panel')
    })

    expect(
      await screen.findByText('Added 1 test from Liver Panel.'),
    ).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('panel_apply_addon', { count: 1 })
  })

  it('shows a toast when a biomarker is added', async () => {
    const wrapper = createWrapperWithToaster()
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleSelect({ code: 'ALT', name: 'ALT' })
    })

    expect(await screen.findByText('Added: ALT')).toBeInTheDocument()
  })

  it('restores the exact selection when undoing a single removal', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapperWithToaster()
    const initialSelection = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]
    await act(async () => {
      usePanelStore.setState({ selected: initialSelection })
    })
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleRemove('ALT')
    })

    expect(
      await screen.findByText('Removed Alanine aminotransferase.'),
    ).toBeInTheDocument()

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    undoButton.focus()
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(usePanelStore.getState().selected).toEqual(initialSelection)
  })

  it('does not clobber later additions when undoing a single removal', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapperWithToaster()
    const initialSelection = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]
    await act(async () => {
      usePanelStore.setState({ selected: initialSelection })
    })
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleRemove('ALT')
    })

    act(() => {
      result.current.handleSelect({ code: 'CRP', name: 'C-reactive protein' })
    })

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    undoButton.focus()
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(usePanelStore.getState().selected).toEqual([
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CRP', name: 'C-reactive protein' },
    ])
  })

  it('restores the correct biomarker when undoing an earlier removal', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapperWithToaster()
    const initialSelection = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CRP', name: 'C-reactive protein' },
    ]
    await act(async () => {
      usePanelStore.setState({ selected: initialSelection })
    })
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.handleRemove('ALT')
    })

    act(() => {
      result.current.handleRemove('AST')
    })

    const altToast = await screen.findByText('Removed Alanine aminotransferase.')
    const altToastRoot = altToast.closest('[data-sonner-toast]') ?? altToast.closest('li')
    if (!(altToastRoot instanceof HTMLElement)) {
      throw new Error('Unable to locate toast container for ALT removal.')
    }

    const undoButton = within(altToastRoot).getByRole('button', { name: 'Undo' })
    undoButton.focus()
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(usePanelStore.getState().selected).toEqual([
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'CRP', name: 'C-reactive protein' },
    ])
  })

  it('restores the exact selection when undoing clear all via keyboard', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapperWithToaster()
    const initialSelection = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]
    await act(async () => {
      usePanelStore.setState({ selected: initialSelection })
    })
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.clearAll()
    })

    expect(await screen.findByText('Cleared 2 tests.')).toBeInTheDocument()
    expect(usePanelStore.getState().selected).toEqual([])

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    undoButton.focus()
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(usePanelStore.getState().selected).toEqual(initialSelection)
  })

  it('does not clobber later additions when undoing clear all', async () => {
    const user = userEvent.setup()
    const wrapper = createWrapperWithToaster()
    const initialSelection = [
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
    ]
    await act(async () => {
      usePanelStore.setState({ selected: initialSelection })
    })
    const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

    act(() => {
      result.current.clearAll()
    })

    act(() => {
      result.current.handleSelect({ code: 'CRP', name: 'C-reactive protein' })
    })

    const undoButton = await screen.findByRole('button', { name: 'Undo' })
    undoButton.focus()
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(usePanelStore.getState().selected).toEqual([
      { code: 'ALT', name: 'Alanine aminotransferase' },
      { code: 'AST', name: 'Aspartate aminotransferase' },
      { code: 'CRP', name: 'C-reactive protein' },
    ])
  })

  describe('sessionStorage persistence', () => {
    it('persists selection to sessionStorage when biomarkers are added', () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      act(() => {
        result.current.handleSelect({ code: 'ALT', name: 'ALT' })
      })

      expect(readPersistedSelection()).toEqual([{ code: 'ALT', name: 'ALT' }])
    })

    it('restores selection from sessionStorage on mount', async () => {
      const existingSelection = [
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ]
      sessionStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(existingSelection))
      await rehydrateStore()

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual(existingSelection)
    })

    it('survives component remount (simulating locale switch)', async () => {
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
      await rehydrateStore()

      // Second mount: should restore from storage
      const { result: result2 } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result2.current.selected).toEqual([
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ])
    })

    it('handles invalid JSON in sessionStorage gracefully', async () => {
      sessionStorage.setItem(PANEL_STORAGE_KEY, 'not valid json')
      await rehydrateStore()

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([])
    })

    it('handles non-array data in sessionStorage gracefully', async () => {
      sessionStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
      await rehydrateStore()

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([])
    })

    it('filters out malformed entries from sessionStorage', async () => {
      const mixedData = [
        { code: 'ALT', name: 'ALT' }, // valid
        { code: 123, name: 'Invalid' }, // invalid code type
        { code: 'MISSING_NAME' }, // missing name
        null, // null entry
        { code: 'AST', name: 'AST' }, // valid
      ]
      sessionStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(mixedData))
      await rehydrateStore()

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      expect(result.current.selected).toEqual([
        { code: 'ALT', name: 'ALT' },
        { code: 'AST', name: 'AST' },
      ])
    })

    it('updates sessionStorage when biomarkers are removed', async () => {
      sessionStorage.setItem(
        PANEL_STORAGE_KEY,
        JSON.stringify([
          { code: 'ALT', name: 'ALT' },
          { code: 'AST', name: 'AST' },
        ]),
      )
      await rehydrateStore()

      const wrapper = createWrapper()
      const { result } = renderHook(() => useBiomarkerSelection(), { wrapper })

      act(() => {
        result.current.handleRemove('ALT')
      })

      expect(readPersistedSelection()).toEqual([{ code: 'AST', name: 'AST' }])
    })
  })
})
