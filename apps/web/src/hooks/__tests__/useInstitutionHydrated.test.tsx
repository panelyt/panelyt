import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistStorage } from 'zustand/middleware'

import { DEFAULT_INSTITUTION_ID, useInstitutionStore } from '../../stores/institutionStore'
import { useInstitutionHydrated } from '../useInstitutionHydrated'

type InstitutionPersistedState = Pick<
  ReturnType<typeof useInstitutionStore.getState>,
  'institutionId' | 'label' | 'hasSelectedInstitution'
>
type InstitutionStorageValue = { state: InstitutionPersistedState; version?: number }

const createAsyncStorage = (
  delayMs: number,
): PersistStorage<InstitutionPersistedState> => {
  return {
    getItem: vi.fn(
      () =>
        new Promise<InstitutionStorageValue | null>((resolve) => {
          setTimeout(() => resolve(null), delayMs)
        }),
    ),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
}

describe('useInstitutionHydrated', () => {
  const originalStorage = useInstitutionStore.persist.getOptions().storage

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useInstitutionStore.setState({
      institutionId: DEFAULT_INSTITUTION_ID,
      label: null,
      hasSelectedInstitution: false,
    })
    useInstitutionStore.persist.clearStorage()
  })

  afterEach(() => {
    useInstitutionStore.persist.setOptions({ storage: originalStorage })
    vi.useRealTimers()
  })

  it('returns false until hydration completes', async () => {
    const asyncStorage = createAsyncStorage(50)
    useInstitutionStore.persist.setOptions({ storage: asyncStorage })

    const rehydratePromise = useInstitutionStore.persist.rehydrate()
    const { result } = renderHook(() => useInstitutionHydrated())

    expect(result.current).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(60)
      await rehydratePromise
    })

    expect(result.current).toBe(true)
  })

  it('defaults to hydrated when persistence is unavailable', () => {
    const store = useInstitutionStore as Omit<typeof useInstitutionStore, 'persist'> & {
      persist?: typeof useInstitutionStore.persist
    }
    const originalPersist = store.persist
    store.persist = undefined

    try {
      const { result } = renderHook(() => useInstitutionHydrated())
      expect(result.current).toBe(true)
    } finally {
      store.persist = originalPersist
    }
  })
})
