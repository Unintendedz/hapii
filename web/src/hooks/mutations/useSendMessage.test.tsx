import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/types/api'
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
}) {
    const { sendMessage } = useSendMessage(props.api as never, props.sessionId, {
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
    })

    return (
        <button type="button" onClick={() => sendMessage('hello')}>Send</button>
    )
}

describe('useSendMessage integration', () => {
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
})
