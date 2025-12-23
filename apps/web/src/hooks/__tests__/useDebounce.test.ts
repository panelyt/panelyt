import { renderHook, waitFor, act } from '@testing-library/react'
import { useDebounce } from '../useDebounce'
import { vi } from 'vitest'

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 250))
    expect(result.current).toBe('initial')
  })

  it('debounces value changes', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 100 },
      }
    )

    expect(result.current).toBe('initial')

    // Change value
    rerender({ value: 'changed', delay: 100 })

    // Should still have old value immediately
    expect(result.current).toBe('initial')

    // Should have new value after delay
    await waitFor(
      () => {
        expect(result.current).toBe('changed')
      },
      { timeout: 250 }
    )
  })

  it('cancels previous timeout when value changes quickly', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 100 },
      }
    )

    // Change value multiple times quickly
    rerender({ value: 'first', delay: 100 })
    rerender({ value: 'second', delay: 100 })
    rerender({ value: 'final', delay: 100 })

    // Should still have initial value
    expect(result.current).toBe('initial')

    // Should only get the final value after delay
    await waitFor(
      () => {
        expect(result.current).toBe('final')
      },
      { timeout: 250 }
    )
  })

  it('uses custom delay', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 50 },
      }
    )

    rerender({ value: 'changed', delay: 50 })

    // Should update faster with shorter delay
    await waitFor(
      () => {
        expect(result.current).toBe('changed')
      },
      { timeout: 200 }
    )
  })

  it('uses default delay when none provided', async () => {
    const { result, rerender } = renderHook(
      (value) => useDebounce(value),
      {
        initialProps: 'initial',
      }
    )

    rerender('changed')

    // Should still have old value after shorter time
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(result.current).toBe('initial')

    // Should have new value after default delay (250ms)
    await waitFor(
      () => {
        expect(result.current).toBe('changed')
      },
      { timeout: 300 }
    )
  })

  it('works with different data types', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      (value) => useDebounce(value, 50),
      {
        initialProps: 42,
      }
    )

    expect(result.current).toBe(42)

    rerender(100)

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    expect(result.current).toBe(100)
    vi.useRealTimers()
  })

  it('handles object values', async () => {
    const initialObj = { name: 'initial' }
    const changedObj = { name: 'changed' }

    const { result, rerender } = renderHook(
      (value) => useDebounce(value, 50),
      {
        initialProps: initialObj,
      }
    )

    expect(result.current).toBe(initialObj)

    rerender(changedObj)

    await waitFor(
      () => {
        expect(result.current).toBe(changedObj)
      },
      { timeout: 200 }
    )
  })
})
