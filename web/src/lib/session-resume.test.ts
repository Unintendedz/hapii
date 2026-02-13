import { describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { resolveSessionIdForSend } from './session-resume'

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

describe('resolveSessionIdForSend', () => {
    it('returns current session ID immediately when session is active', async () => {
        const api = {
            getSession: vi.fn(),
            resumeSession: vi.fn(),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: makeSession(1_000_000, { active: true }),
        })

        expect(resolved).toBe('session-1')
        expect(api.getSession).not.toHaveBeenCalled()
        expect(api.resumeSession).not.toHaveBeenCalled()
    })

    it('waits for new session to become active and does not attempt resume', async () => {
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
                // Even if a token exists, we should not resume a session that is still starting.
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
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: starting,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            inactiveGraceTimeoutMs: 1_000,
            warmupTimeoutMs: 5_000,
            warmupPollMs: 100,
        })

        expect(resolved).toBe('session-1')
        expect(api.resumeSession).not.toHaveBeenCalled()
        expect(api.getSession).toHaveBeenCalled()
    })

    it('throws a starting error if a new session does not become active in time', async () => {
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
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: starting })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        await expect(resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: starting,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            inactiveGraceTimeoutMs: 0,
            warmupTimeoutMs: 500,
            warmupPollMs: 100,
        })).rejects.toThrow('Session is still starting')

        expect(api.resumeSession).not.toHaveBeenCalled()
    })

    it('resumes an inactive session that was previously alive', async () => {
        let nowMs = 1_000_000
        const createdAt = nowMs - 10_000

        const inactive = makeSession(nowMs, {
            createdAt,
            updatedAt: createdAt,
            active: false,
            // Previously alive, so this should not be treated as "starting".
            activeAt: createdAt + 5_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                codexSessionId: 'codex-resume-token',
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: inactive })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: inactive,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            inactiveGraceTimeoutMs: 0,
            warmupTimeoutMs: 1_000,
            warmupPollMs: 100,
        })

        expect(resolved).toBe('session-2')
        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
    })

    it('resumes an inactive Claude session when claudeSessionId is available', async () => {
        let nowMs = 1_000_000
        const createdAt = nowMs - 10_000

        const inactive = makeSession(nowMs, {
            createdAt,
            updatedAt: createdAt,
            active: false,
            activeAt: createdAt + 5_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude',
                claudeSessionId: 'claude-resume-token',
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: inactive })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        const resolved = await resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: inactive,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            inactiveGraceTimeoutMs: 0,
            warmupTimeoutMs: 1_000,
            warmupPollMs: 100,
        })

        expect(resolved).toBe('session-2')
        expect(api.resumeSession).toHaveBeenCalledWith('session-1')
    })

    it('fails fast when resume token is unavailable for a non-starting inactive session', async () => {
        let nowMs = 1_000_000
        const createdAt = nowMs - 10_000

        const inactive = makeSession(nowMs, {
            createdAt,
            updatedAt: createdAt,
            active: false,
            activeAt: createdAt + 5_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
            },
        })

        const api = {
            getSession: vi.fn(async () => ({ session: inactive })),
            resumeSession: vi.fn(async () => 'session-2'),
        }

        await expect(resolveSessionIdForSend({
            api: api as never,
            sessionId: 'session-1',
            session: inactive,
            now: () => nowMs,
            sleep: async (ms: number) => {
                nowMs += ms
            },
            inactiveGraceTimeoutMs: 0,
            warmupTimeoutMs: 1_000,
            warmupPollMs: 100,
        })).rejects.toThrow('Resume session ID unavailable')

        expect(api.resumeSession).not.toHaveBeenCalled()
    })
})
