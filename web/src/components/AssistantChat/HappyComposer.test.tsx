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

    it('renders queued messages above the input', () => {
        const t = (key: string, params?: Record<string, string | number>) => {
            if (key === 'composer.queue.title') return 'Queued messages'
            if (key === 'composer.queue.sending') return 'Sending'
            if (key === 'composer.queue.queued') return 'Queued'
            if (key === 'composer.queue.attachmentsOnly') return 'Attachments only'
            if (key === 'composer.queue.attachments') return `${params?.n ?? 0} attachments`
            if (key === 'composer.queue.pause') return 'Pause queue'
            if (key === 'composer.queue.resume') return 'Resume queue'
            if (key === 'composer.queue.paused') return 'Paused'
            if (key === 'button.edit') return 'Edit'
            if (key === 'button.delete') return 'Delete'
            if (key === 'button.cancel') return 'Cancel'
            if (key === 'button.save') return 'Save'
            return key
        }

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer
                    sessionId="s1"
                    queuedMessages={[
                        {
                            localId: 'm1',
                            text: 'first queued message',
                            attachmentsCount: 0,
                            status: 'sending'
                        },
                        {
                            localId: 'm2',
                            text: '',
                            attachmentsCount: 2,
                            status: 'queued'
                        }
                    ]}
                />
            </I18nContext.Provider>
        )

        const queueHeading = screen.getByText('Queued messages')
        const textbox = screen.getByRole('textbox')

        expect(queueHeading).toBeInTheDocument()
        expect(screen.getByText('Queued')).toBeInTheDocument()
        expect(screen.getByText('Attachments only')).toBeInTheDocument()
        expect(screen.getByText('2 attachments')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Pause queue' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
        expect(screen.queryByText('Sending')).not.toBeInTheDocument()
        expect(screen.queryByText('first queued message')).not.toBeInTheDocument()
        expect(queueHeading.compareDocumentPosition(textbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('hides the queue panel when nothing is actually queued', () => {
        const t = (key: string) => key

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer
                    sessionId="s1"
                    queuedMessages={[
                        {
                            localId: 'm1',
                            text: 'sending only',
                            attachmentsCount: 0,
                            status: 'sending'
                        }
                    ]}
                />
            </I18nContext.Provider>
        )

        expect(screen.queryByText('composer.queue.title')).not.toBeInTheDocument()
        expect(screen.queryByText('sending only')).not.toBeInTheDocument()
    })

    it('edits and deletes queued items with touch-friendly controls', () => {
        const onEditQueuedMessage = vi.fn()
        const onDeleteQueuedMessage = vi.fn()

        const t = (key: string) => {
            if (key === 'composer.queue.title') return 'Queued messages'
            if (key === 'composer.queue.queued') return 'Queued'
            if (key === 'button.edit') return 'Edit'
            if (key === 'button.delete') return 'Delete'
            if (key === 'button.cancel') return 'Cancel'
            if (key === 'button.save') return 'Save'
            return key
        }

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer
                    sessionId="s1"
                    queuedMessages={[
                        {
                            localId: 'm2',
                            text: 'queued text',
                            attachmentsCount: 0,
                            status: 'queued'
                        }
                    ]}
                    onEditQueuedMessage={onEditQueuedMessage}
                    onDeleteQueuedMessage={onDeleteQueuedMessage}
                />
            </I18nContext.Provider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
        fireEvent.change(screen.getByDisplayValue('queued text'), { target: { value: 'edited text' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(onEditQueuedMessage).toHaveBeenCalledWith('m2', 'edited text')

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(onDeleteQueuedMessage).toHaveBeenCalledWith('m2')
    })

    it('pauses the queue when aborting and can resume from the queue panel', () => {
        const onPauseQueuedMessages = vi.fn()
        const onResumeQueuedMessages = vi.fn()

        assistantState.thread.isRunning = true

        const t = (key: string) => {
            if (key === 'composer.queue.title') return 'Queued messages'
            if (key === 'composer.queue.queued') return 'Queued'
            if (key === 'composer.queue.resume') return 'Resume queue'
            if (key === 'composer.queue.paused') return 'Paused'
            return key
        }

        render(
            <I18nContext.Provider value={{ t, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer
                    sessionId="s1"
                    queuedMessages={[
                        {
                            localId: 'm2',
                            text: 'queued text',
                            attachmentsCount: 0,
                            status: 'queued'
                        }
                    ]}
                    isQueuePaused
                    onPauseQueuedMessages={onPauseQueuedMessages}
                    onResumeQueuedMessages={onResumeQueuedMessages}
                />
            </I18nContext.Provider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'composer.abort' }))

        expect(onPauseQueuedMessages).toHaveBeenCalledTimes(1)
        expect(cancelRunMock).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByRole('button', { name: 'Resume queue' }))

        expect(onResumeQueuedMessages).toHaveBeenCalledTimes(1)
    })

    it('does not auto-pause when aborting without queued backlog', () => {
        const onPauseQueuedMessages = vi.fn()

        assistantState.thread.isRunning = true

        render(
            <I18nContext.Provider value={{ t: (key: string) => key, locale: 'en', setLocale: vi.fn() }}>
                <HappyComposer
                    sessionId="s1"
                    queuedMessages={[]}
                    onPauseQueuedMessages={onPauseQueuedMessages}
                />
            </I18nContext.Provider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'composer.abort' }))

        expect(onPauseQueuedMessages).not.toHaveBeenCalled()
        expect(cancelRunMock).toHaveBeenCalledTimes(1)
    })
})
