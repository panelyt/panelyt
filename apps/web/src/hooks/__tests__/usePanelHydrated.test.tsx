import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistStorage } from 'zustand/middleware'

import { usePanelStore } from '../../stores/panelStore'
import { usePanelHydrated } from '../usePanelHydrated'

type PanelPersistedState = Pick<
  ReturnType<typeof usePanelStore.getState>,
  'selected' | 'lastOptimizationSummary'
>
type PanelStorageValue = { state: PanelPersistedState; version?: number }

const createAsyncStorage = (delayMs: number): PersistStorage<PanelPersistedState> => {
  return {
    getItem: vi.fn(
      () =>
        new Promise<PanelStorageValue | null>((resolve) => {
          setTimeout(() => resolve(null), delayMs)
        }),
    ),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

describe('usePanelHydrated', () => {
  const originalStorage = usePanelStore.persist.getOptions().storage

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    usePanelStore.setState({ selected: [], lastOptimizationSummary: undefined, lastRemoved: undefined })
    usePanelStore.persist.clearStorage()
  })

  afterEach(() => {
    usePanelStore.persist.setOptions({ storage: originalStorage })
    vi.useRealTimers()
  })

  it('returns false until hydration completes', async () => {
    const asyncStorage = createAsyncStorage(50)
    usePanelStore.persist.setOptions({ storage: asyncStorage })

    const rehydratePromise = usePanelStore.persist.rehydrate()
    const { result } = renderHook(() => usePanelHydrated())

    expect(result.current).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(60)
      await rehydratePromise
    })

    expect(result.current).toBe(true)
  })
})
