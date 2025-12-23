import { renderHook, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'

import { useTemplateModal } from '../useTemplateModal'
import plMessages from '../../i18n/messages/pl.json'

vi.mock('../useTemplateAdmin', () => ({
  useTemplateAdmin: () => ({
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

describe('useTemplateModal', () => {
  it('uses Polish validation errors when no biomarkers are provided', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useTemplateModal({
          biomarkers: [],
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(result.current.error).toBe(plMessages.errors.templateNeedsBiomarkers)
  })
})
