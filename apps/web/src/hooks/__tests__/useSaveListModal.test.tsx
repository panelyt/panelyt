import { renderHook, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSaveListModal } from '../useSaveListModal'
import plMessages from '../../i18n/messages/pl.json'

let mutateAsyncMock = vi.fn()

vi.mock('../useSavedLists', () => ({
  useSavedLists: () => ({
    createMutation: { mutateAsync: mutateAsyncMock },
  }),
}))

vi.mock('../../lib/analytics', () => ({
  track: vi.fn(),
  markTtorStart: vi.fn(),
  resetTtorStart: vi.fn(),
}))

import { track } from '../../lib/analytics'

const trackMock = vi.mocked(track)

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
  beforeEach(() => {
    mutateAsyncMock = vi.fn()
    trackMock.mockClear()
  })

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

  it('tracks save_list_submit on success', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ id: 'list-1' })
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useSaveListModal({
          isAuthenticated: true,
          biomarkers: [{ code: 'ALT', name: 'ALT' }],
          onExternalError: vi.fn(),
        }),
      { wrapper },
    )

    await act(async () => {
      result.current.open('Baseline panel')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(trackMock).toHaveBeenCalledWith('save_list_submit', { status: 'success' })
  })

  it('tracks save_list_submit on failure', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('fail'))
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useSaveListModal({
          isAuthenticated: true,
          biomarkers: [{ code: 'ALT', name: 'ALT' }],
          onExternalError: vi.fn(),
        }),
      { wrapper },
    )

    await act(async () => {
      result.current.open('Baseline panel')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(trackMock).toHaveBeenCalledWith('save_list_submit', { status: 'failure' })
  })

  it('requests auth instead of opening when unauthenticated', () => {
    const onRequireAuth = vi.fn()
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useSaveListModal({
          isAuthenticated: false,
          biomarkers: [{ code: 'ALT', name: 'ALT' }],
          onExternalError: vi.fn(),
          onRequireAuth,
        }),
      { wrapper },
    )

    act(() => {
      result.current.open('Baseline panel')
    })

    expect(onRequireAuth).toHaveBeenCalledTimes(1)
    expect(result.current.isOpen).toBe(false)
  })

  it('requests auth instead of saving when unauthenticated', async () => {
    const onRequireAuth = vi.fn()
    const wrapper = createWrapper()
    const { result } = renderHook(
      () =>
        useSaveListModal({
          isAuthenticated: false,
          biomarkers: [{ code: 'ALT', name: 'ALT' }],
          onExternalError: vi.fn(),
          onRequireAuth,
        }),
      { wrapper },
    )

    act(() => {
      result.current.setName('Baseline panel')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(onRequireAuth).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })
})
