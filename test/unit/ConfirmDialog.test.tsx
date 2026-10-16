// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '#/components/ConfirmDialog'

afterEach(cleanup)

describe('ConfirmDialog', () => {
  it('lets the user cancel without running the destructive action', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        state={{ title: 'Delete session?', message: 'This removes the session.', confirmLabel: 'Delete', confirmVariant: 'danger', onConfirm }}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('alertdialog', { name: 'Delete session?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('prevents duplicate actions while confirmation is pending and closes on completion', async () => {
    let finish!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        state={{ title: 'Delete session?', message: 'This removes the session.', confirmLabel: 'Delete', confirmVariant: 'danger', onConfirm }}
        onClose={onClose}
      />,
    )

    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Delete' })
    fireEvent.click(confirm)
    expect(confirm.disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => { finish() })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
