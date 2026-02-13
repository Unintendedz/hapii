import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nContext } from '@/lib/i18n-context'
import { HappyComposer } from './HappyComposer'

vi.mock('@assistant-ui/react', async () => {
    const React = await import('react')

    const ComposerPrimitive = {
        Root: (props: { className?: string; onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) => (
            <form className={props.className} onSubmit={props.onSubmit}>
                {props.children}
            </form>
        ),
        Input: React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
            maxRows?: number
            submitOnEnter?: boolean
            cancelOnEscape?: boolean
        }>(function Input(props, ref) {
            const { maxRows: _maxRows, submitOnEnter: _submitOnEnter, cancelOnEscape: _cancelOnEscape, ...rest } = props
            return <textarea ref={ref} {...rest} />
        }),
        AddAttachment: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
            <button type="button" {...props}>
                {props.children}
            </button>
        ),
        Attachments: () => null
    }

    return {
        ComposerPrimitive,
        useAssistantApi: () => ({
            thread: () => ({ cancelRun: vi.fn() }),
            composer: () => ({
                send: vi.fn(),
                addAttachment: vi.fn(),
                setText: vi.fn()
            })
        }),
        useAssistantState: (selector: (state: any) => any) => selector({
            composer: { text: '', attachments: [] },
            thread: { isRunning: false, isDisabled: false }
        })
    }
})

describe('HappyComposer', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn()
            }))
        })
    })

    it('closes the permission/settings menu when clicking outside', async () => {
        const t = (key: string) => key

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer agentFlavor="claude" onPermissionModeChange={vi.fn()} />
            </I18nContext.Provider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'composer.settings' }))
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.pointerDown(document.body)

        await waitFor(() => {
            expect(screen.queryByText('misc.permissionMode')).not.toBeInTheDocument()
        })
    })
})
