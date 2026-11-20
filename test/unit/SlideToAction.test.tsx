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

describe('slide to check in / out', () => {
  it('completes synchronously on End release (inside the gesture) and only once', () => {
    const onComplete = vi.fn()
    const onArm = vi.fn()
    render(<SlideToAction mode="in" onComplete={onComplete} onArm={onArm} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onArm).toHaveBeenCalledOnce()
    fireEvent.keyUp(slider, { key: 'End' })
    // No timers advanced: the action must run in the same event so Face ID can open.
    expect(onComplete).toHaveBeenCalledOnce()
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('checkout travels the other way (Home) and Enter is a keyboard shortcut', () => {
    const onComplete = vi.fn()
    const { unmount } = render(<SlideToAction mode="out" onComplete={onComplete} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyUp(slider, { key: 'Home' })
    expect(onComplete).toHaveBeenCalledOnce()
    unmount()

    const onEnter = vi.fn()
    render(<SlideToAction mode="out" onComplete={onEnter} />)
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' })
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('a short drag snaps back and disarms', async () => {
    const onComplete = vi.fn()
    const onDisarm = vi.fn()
    render(<SlideToAction mode="in" onComplete={onComplete} onDisarm={onDisarm} />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    await act(async () => { await vi.advanceTimersByTimeAsync(500) })
    expect(onComplete).not.toHaveBeenCalled()
    expect(onDisarm).toHaveBeenCalledOnce()
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
  })

  it('offers a screen-reader button alternative and ignores input while disabled', () => {
    const onComplete = vi.fn()
    render(<SlideToAction mode="in" disabled onComplete={onComplete} actionLabel="Check in with Face ID" />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyUp(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Enter' })
    const button = screen.getByRole('button', { name: 'Check in with Face ID' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
