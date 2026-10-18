// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlideToAction } from '#/components/SlideToAction'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(304)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('keyboard attendance actions', () => {
  it('submits a check-in when End is released and prevents a duplicate submission', async () => {
    const onCheckIn = vi.fn().mockResolvedValue(undefined)
    render(<SlideToAction mode="in" onCheckIn={onCheckIn} onCheckOut={vi.fn()} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onCheckIn).toHaveBeenCalledOnce()
  })

  it('requires confirmation for keyboard checkout and allows cancellation', async () => {
    const onCheckOut = vi.fn()
    render(<SlideToAction mode="out" onCheckIn={vi.fn()} onCheckOut={onCheckOut} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyUp(slider, { key: 'Home' })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(onCheckOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCheckOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('ignores keyboard actions while disabled', async () => {
    const onCheckIn = vi.fn()
    render(<SlideToAction mode="in" disabled onCheckIn={onCheckIn} onCheckOut={vi.fn()} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onCheckIn).not.toHaveBeenCalled()
  })
})
