import { renderHook, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'

import { useBiomarkerSelection } from '../useBiomarkerSelection'
import plMessages from '../../i18n/messages/pl.json'

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
})
