import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nContext } from '@/lib/i18n-context'
import { HappyComposer } from './HappyComposer'

const {
    assistantState,
    addAttachmentMock,
    cancelRunMock,
    sendMock,
    setTextMock,
} = vi.hoisted(() => ({
    assistantState: {
        composer: {
            text: '',
            attachments: [] as Array<{ status: { type: string } }>,
        },
        thread: {
            isRunning: false,
            isDisabled: false,
        },
    },
    addAttachmentMock: vi.fn(),
    cancelRunMock: vi.fn(),
    sendMock: vi.fn(),
    setTextMock: vi.fn()
}))

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
            thread: () => ({ cancelRun: cancelRunMock }),
            composer: () => ({
                send: sendMock,
                addAttachment: addAttachmentMock,
                setText: setTextMock
            })
        }),
        useAssistantState: (selector: (state: any) => any) => selector(assistantState)
    }
})

describe('HappyComposer', () => {
    beforeEach(() => {
        cleanup()
        localStorage.clear()
        assistantState.composer.text = ''
        assistantState.composer.attachments = []
        assistantState.thread.isRunning = false
        assistantState.thread.isDisabled = false
        addAttachmentMock.mockReset()
        cancelRunMock.mockReset()
        sendMock.mockReset()
        setTextMock.mockClear()

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
                <HappyComposer sessionId="s1" agentFlavor="claude" onPermissionModeChange={vi.fn()} />
            </I18nContext.Provider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'composer.settings' }))
        expect(screen.getByText('misc.permissionMode')).toBeInTheDocument()

        fireEvent.pointerDown(document.body)

        await waitFor(() => {
            expect(screen.queryByText('misc.permissionMode')).not.toBeInTheDocument()
        })
    })

    it('restores draft text from localStorage', async () => {
        localStorage.setItem('hapi:sessionDraft:s1', 'hello draft')

        const t = (key: string) => key

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer sessionId="s1" agentFlavor="claude" onPermissionModeChange={vi.fn()} />
            </I18nContext.Provider>
        )

        await waitFor(() => {
            expect(setTextMock).toHaveBeenCalledWith('hello draft')
        })
    })

    it('allows sending while thread is running', () => {
        assistantState.composer.text = 'queue this'
        assistantState.thread.isRunning = true

        const t = (key: string) => key

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer sessionId="s1" />
            </I18nContext.Provider>
        )

        const sendButton = screen.getByRole('button', { name: 'composer.send' })
        expect(sendButton).toBeEnabled()

        fireEvent.click(sendButton)

        expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('does not render a voice button when composer is empty', () => {
        const t = (key: string) => key

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer sessionId="s1" />
            </I18nContext.Provider>
        )

        expect(screen.queryByRole('button', { name: 'composer.voice' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'composer.send' })).toBeDisabled()
    })
})
