import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/types/api'
import { clearMessageWindow, getMessageWindowState } from '@/lib/message-window-store'
import { resolveSessionIdForSend } from '@/lib/session-resume'
import { useSendMessage } from './useSendMessage'

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
    }),
}))

function makeSession(nowMs: number, overrides?: Partial<Session>): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: nowMs,
        updatedAt: nowMs,
        active: false,
        activeAt: nowMs,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        modelMode: 'default',
        ...overrides,
    }
}

function createDeferred(): {
    promise: Promise<void>
    resolve: () => void
} {
    let resolvePromise!: () => void
    const promise = new Promise<void>((resolve) => {
        resolvePromise = () => resolve()
    })
    return {
        promise,
        resolve: resolvePromise,
    }
}

function Harness(props: {
    api: {
        getSession: (sessionId: string) => Promise<{ session: Session }>
        resumeSession: (sessionId: string) => Promise<string>
        sendMessage: (sessionId: string, text: string, localId?: string | null) => Promise<void>
    }
    sessionId: string
    initialSession: Session
    now: () => number
    sleep: (ms: number) => Promise<void>
    onSessionResolved?: (sessionId: string) => void
}) {
    const { sendMessage, queuedMessages } = useSendMessage(props.api as never, props.sessionId, {
        resolveSessionId: async (currentSessionId) => {
            return await resolveSessionIdForSend({
                api: props.api as never,
                sessionId: currentSessionId,
                session: props.initialSession,
                now: props.now,
                sleep: props.sleep,
                inactiveGraceTimeoutMs: 1_000,
                warmupTimeoutMs: 10_000,
                warmupPollMs: 100,
            })
        },
        onSessionResolved: props.onSessionResolved,
    })

    return (
        <div>
            <button type="button" onClick={() => sendMessage('hello')}>Send</button>
            <button type="button" onClick={() => sendMessage('follow-up')}>Queue</button>
            <div data-testid="queue-state">
                {queuedMessages.map((message) => `${message.status}:${message.text}`).join('|')}
            </div>
        </div>
    )
}

describe('useSendMessage integration', () => {
    beforeEach(() => {
        cleanup()
        clearMessageWindow('session-1')
        clearMessageWindow('session-2')
    })

    it('waits for session warmup and then sends without resuming', async () => {
        let nowMs = 1_000_000
        const createdAt = nowMs - 500

        const starting = makeSession(nowMs, {
            createdAt,
            updatedAt: createdAt,
            active: false,
            activeAt: createdAt,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-token',
            },
        })

        const active = makeSession(nowMs, {
            createdAt,
            updatedAt: nowMs,
            active: true,
            activeAt: nowMs,
            metadata: starting.metadata,
        })

        const snapshots = [starting, active]
        let index = 0

        const api = {
            getSession: vi.fn(async () => {
                const session = snapshots[Math.min(index, snapshots.length - 1)]
                index += 1
                return { session }
            }),
            resumeSession: vi.fn(async () => 'session-2'),
            sendMessage: vi.fn(async () => {}),
        }

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })

        render(
            <QueryClientProvider client={queryClient}>
                <Harness
                    api={api}
                    sessionId="session-1"
                    initialSession={starting}
                    now={() => nowMs}
                    sleep={async (ms) => {
                        nowMs += ms
                    }}
                />
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(1)
        })

        expect(api.resumeSession).not.toHaveBeenCalled()
        expect(api.sendMessage).toHaveBeenCalledWith('session-1', 'hello', expect.any(String), undefined)
    })

    it('queues later messages while an earlier send is still in flight', async () => {
        const active = makeSession(1_000_000, {
            active: true,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
            },
        })

        const firstSend = createDeferred()

        const api = {
            getSession: vi.fn(async () => ({ session: active })),
            resumeSession: vi.fn(async () => 'session-2'),
            sendMessage: vi.fn(async (_sessionId: string, text: string) => {
                if (text === 'hello') {
                    await firstSend.promise
                }
            }),
        }

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })

        render(
            <QueryClientProvider client={queryClient}>
                <Harness
                    api={api}
                    sessionId="session-1"
                    initialSession={active}
                    now={() => 1_000_000}
                    sleep={async () => {}}
                />
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        fireEvent.click(screen.getByRole('button', { name: 'Queue' }))

        await waitFor(() => {
            expect(screen.getByTestId('queue-state')).toHaveTextContent('sending:hello|queued:follow-up')
        })

        await waitFor(() => {
            expect(
                getMessageWindowState('session-1').messages.map((message) => message.originalText ?? '')
            ).toEqual(['hello'])
        })

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(1)
        })

        firstSend.resolve()

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(2)
        })

        await waitFor(() => {
            expect(
                getMessageWindowState('session-1').messages.map((message) => message.originalText ?? '')
            ).toEqual(['hello', 'follow-up'])
        })

        await waitFor(() => {
            expect(screen.getByTestId('queue-state')).toHaveTextContent('')
        })

        expect(api.sendMessage).toHaveBeenNthCalledWith(1, 'session-1', 'hello', expect.any(String), undefined)
        expect(api.sendMessage).toHaveBeenNthCalledWith(2, 'session-1', 'follow-up', expect.any(String), undefined)
    })

    it('defers session replacement until queued sends are flushed', async () => {
        let nowMs = 1_000_000

        const inactive = makeSession(nowMs, {
            createdAt: nowMs - 200_000,
            updatedAt: nowMs - 200_000,
            active: false,
            activeAt: nowMs - 200_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-token',
            },
        })

        const firstSend = createDeferred()
        const onSessionResolved = vi.fn()

        const api = {
            getSession: vi.fn(async () => ({ session: inactive })),
            resumeSession: vi.fn(async () => 'session-2'),
            sendMessage: vi.fn(async (_sessionId: string, text: string) => {
                if (text === 'hello') {
                    await firstSend.promise
                }
            }),
        }

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })

        render(
            <QueryClientProvider client={queryClient}>
                <Harness
                    api={api}
                    sessionId="session-1"
                    initialSession={inactive}
                    now={() => nowMs}
                    sleep={async (ms) => {
                        nowMs += ms
                    }}
                    onSessionResolved={onSessionResolved}
                />
            </QueryClientProvider>
        )

        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        fireEvent.click(screen.getByRole('button', { name: 'Queue' }))

        await waitFor(() => {
            expect(screen.getByTestId('queue-state')).toHaveTextContent('sending:hello|queued:follow-up')
        })

        await waitFor(() => {
            expect(
                getMessageWindowState('session-1').messages.map((message) => message.originalText ?? '')
            ).toEqual(['hello'])
        })

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(1)
        })

        expect(api.sendMessage).toHaveBeenNthCalledWith(1, 'session-2', 'hello', expect.any(String), undefined)
        expect(onSessionResolved).not.toHaveBeenCalled()

        firstSend.resolve()

        await waitFor(() => {
            expect(api.sendMessage).toHaveBeenCalledTimes(2)
        })

        await waitFor(() => {
            expect(
                getMessageWindowState('session-1').messages.map((message) => message.originalText ?? '')
            ).toEqual(['hello', 'follow-up'])
        })

        await waitFor(() => {
            expect(screen.getByTestId('queue-state')).toHaveTextContent('')
        })

        expect(api.sendMessage).toHaveBeenNthCalledWith(2, 'session-2', 'follow-up', expect.any(String), undefined)

        await waitFor(() => {
            expect(onSessionResolved).toHaveBeenCalledWith('session-2')
        })
    })
})
