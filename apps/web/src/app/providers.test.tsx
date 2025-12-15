import { renderHook } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import { ReactNode } from 'react'

import { Providers } from './providers'

describe('Providers', () => {
  it('configures React Query cache defaults', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers>{children}</Providers>
    )

    const { result } = renderHook(() => useQueryClient(), { wrapper })

    const defaults = result.current.getDefaultOptions()
    const queryDefaults = defaults.queries ?? {}

    expect(queryDefaults.staleTime).toBe(1000 * 60 * 2)
    expect(queryDefaults.gcTime).toBe(1000 * 60 * 10)
    expect(queryDefaults.refetchOnWindowFocus).toBe(false)
    expect(queryDefaults.retry).toBe(1)
  })
})
