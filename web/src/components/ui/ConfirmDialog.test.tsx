import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nContext } from '@/lib/i18n-context'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
    beforeEach(() => {
        cleanup()
    })

    it('confirms with Enter by default', async () => {
        const onConfirm = vi.fn(async () => {})
        const onClose = vi.fn()

        render(
            <I18nContext.Provider value={{ t: (key: string) => key, locale: 'en', setLocale: vi.fn() }}>
                <ConfirmDialog
                    isOpen
                    onClose={onClose}
                    title="Archive session"
                    description="Archive this session?"
                    confirmLabel="Archive"
                    confirmingLabel="Archiving"
                    onConfirm={onConfirm}
                    isPending={false}
                    destructive
                />
            </I18nContext.Provider>
        )

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', code: 'Enter' })

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledTimes(1)
        })

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not confirm when Enter is pressed on the cancel button', async () => {
        const onConfirm = vi.fn(async () => {})

        render(
            <I18nContext.Provider value={{ t: (key: string) => key, locale: 'en', setLocale: vi.fn() }}>
                <ConfirmDialog
                    isOpen
                    onClose={vi.fn()}
                    title="Archive session"
                    description="Archive this session?"
                    confirmLabel="Archive"
                    confirmingLabel="Archiving"
                    onConfirm={onConfirm}
                    isPending={false}
                    destructive
                />
            </I18nContext.Provider>
        )

        const cancelButton = screen.getByRole('button', { name: 'button.cancel' })
        cancelButton.focus()
        fireEvent.keyDown(cancelButton, { key: 'Enter', code: 'Enter' })

        expect(onConfirm).not.toHaveBeenCalled()
    })
})
