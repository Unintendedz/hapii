import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'
import { SyncEngine } from './syncEngine'

function createEngine(store: Store): SyncEngine {
    const io = {
        of: () => ({
            to: () => ({ emit: () => {} })
        })
    } as any

    return new SyncEngine(
        store,
        io,
        new RpcRegistry(),
        new SSEManager(0, new VisibilityTracker())
    )
}

describe('SyncEngine archiveSession', () => {
    it('marks the session archived after a successful kill', async () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession(
            'archive-success',
            {
                path: '/tmp/project',
                host: 'test-host',
                lifecycleState: 'running'
            },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            ;(engine as any).rpcGateway = {
                killSession: async () => {}
            }

            await engine.archiveSession(session.id)

            const archived = engine.getSession(session.id)
            expect(archived?.active).toBe(false)
            expect(archived?.metadata?.lifecycleState).toBe('archived')
            expect(archived?.metadata?.archivedBy).toBe('hub')
            expect(archived?.metadata?.archiveReason).toBe('Archived via hub')
        } finally {
            engine.stop()
        }
    })

    it('forces archive when session RPC handler is unavailable', async () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession(
            'archive-fallback',
            {
                path: '/tmp/project',
                host: 'test-host',
                lifecycleState: 'running'
            },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            ;(engine as any).rpcGateway = {
                killSession: async () => {
                    throw new Error(`RPC handler not registered: ${session.id}:killSession`)
                }
            }

            await engine.archiveSession(session.id)

            const archived = engine.getSession(session.id)
            expect(archived?.active).toBe(false)
            expect(archived?.metadata?.lifecycleState).toBe('archived')
            expect(archived?.metadata?.archivedBy).toBe('hub')
            expect(archived?.metadata?.archiveReason).toContain('Forced archive:')
        } finally {
            engine.stop()
        }
    })

    it('surfaces non-recoverable archive errors', async () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession(
            'archive-hard-failure',
            {
                path: '/tmp/project',
                host: 'test-host',
                lifecycleState: 'running'
            },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            engine.handleSessionAlive({ sid: session.id, time: Date.now(), thinking: false })

            ;(engine as any).rpcGateway = {
                killSession: async () => {
                    throw new Error('RPC timeout while killing session')
                }
            }

            await expect(engine.archiveSession(session.id)).rejects.toThrow('RPC timeout while killing session')
        } finally {
            engine.stop()
        }
    })

    it('auto-archives stale idle active sessions after 24 hours', async () => {
        const store = new Store(':memory:')
        const session = store.sessions.getOrCreateSession(
            'archive-auto-active',
            {
                path: '/tmp/project',
                host: 'test-host',
                lifecycleState: 'running'
            },
            { requests: {} },
            'default'
        )

        const engine = createEngine(store)
        try {
            const now = Date.now()
            engine.handleSessionAlive({ sid: session.id, time: now, thinking: false })

            const inMemory = engine.getSession(session.id)
            expect(inMemory).toBeDefined()
            if (!inMemory) {
                return
            }

            inMemory.updatedAt = now - (24 * 60 * 60 * 1000) - 1_000
            inMemory.activeAt = now
            inMemory.thinking = false
            inMemory.work = { current: null, last: null }
            inMemory.agentState = { requests: {} }

            ;(engine as any).rpcGateway = {
                killSession: async () => {}
            }

            await (engine as any).autoArchiveStaleSessions(now)

            const archived = engine.getSession(session.id)
            expect(archived?.active).toBe(false)
            expect(archived?.metadata?.lifecycleState).toBe('archived')
            expect(archived?.metadata?.archivedBy).toBe('hub')
            expect(archived?.metadata?.archiveReason).toBe('Auto-archived after 24 hours of inactivity')
        } finally {
            engine.stop()
        }
    })
})
