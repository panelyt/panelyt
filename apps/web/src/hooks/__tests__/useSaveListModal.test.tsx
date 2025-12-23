import { renderHook, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'

import { useSaveListModal } from '../useSaveListModal'
import plMessages from '../../i18n/messages/pl.json'

vi.mock('../useSavedLists', () => ({
  useSavedLists: () => ({
    createMutation: { mutateAsync: vi.fn() },
  }),
}))

const createWrapper = () => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="pl" messages={plMessages}>
        {children}
      </NextIntlClientProvider>
    )
  }
}

describe('useSaveListModal', () => {
  it('uses Polish validation errors for an empty name', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useSaveListModal({
          isAuthenticated: true,
          biomarkers: [],
          onExternalError: vi.fn(),
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(result.current.error).toBe(plMessages.errors.listNameEmpty)
  })
})
