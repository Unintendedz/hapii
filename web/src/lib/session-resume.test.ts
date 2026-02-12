import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { resolveSessionIdForSend } from './session-resume'

function makeSession(overrides?: Partial<Session>): Session {
    const now = Date.now()
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: now,
        updatedAt: now,
        active: false,
        activeAt: now,
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

describe('resolveSessionIdForSend', () => {
    it('returns current session ID immediately when session is active', async () => {
        const api = {
            getSession: vi.fn(),
            resumeSession: vi.fn(),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: makeSession({ active: true }),
        })

        expect(resolved).toBe('session-1')
        expect(api.getSession).not.toHaveBeenCalled()
        expect(api.resumeSession).not.toHaveBeenCalled()
    })

    it('resumes inactive session when resume token is available', async () => {
        const inactiveWithToken = makeSession({
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-resume-token',
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: inactiveWithToken })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: inactiveWithToken,
        })

        expect(resolved).toBe('session-2')
        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
    })

    it('waits for fresh session warmup and avoids unnecessary resume', async () => {
        let nowMs = 1_000_000
        const inactiveNoToken = makeSession({
            createdAt: nowMs - 500,
            updatedAt: nowMs - 500,
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
            },
        })
        const activeAfterWarmup = makeSession({
            createdAt: inactiveNoToken.createdAt,
            updatedAt: nowMs,
            active: true,
            metadata: inactiveNoToken.metadata,
        })

        const snapshots = [inactiveNoToken, inactiveNoToken, activeAfterWarmup]
        let index = 0

        const api = {
            getSession: vi.fn(async () => {
                const session = snapshots[Math.min(index, snapshots.length - 1)]
                index += 1
                return { session }
            }),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: inactiveNoToken,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            warmupTimeoutMs: 2_000,
            warmupPollMs: 100,
            freshSessionWindowMs: 5_000,
        })

        expect(resolved).toBe('session-1')
        expect(api.resumeSession).not.toHaveBeenCalled()
        expect(api.getSession).toHaveBeenCalled()
    })

    it('fails fast when session is stale and resume token is unavailable', async () => {
        let nowMs = 2_000_000
        const staleInactive = makeSession({
            createdAt: nowMs - 120_000,
            updatedAt: nowMs - 120_000,
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: staleInactive })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        await expect(resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: staleInactive,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            warmupTimeoutMs: 2_000,
            warmupPollMs: 100,
            freshSessionWindowMs: 5_000,
        })).rejects.toThrow('Session is still starting')

        expect(api.resumeSession).not.toHaveBeenCalled()
    })
})
