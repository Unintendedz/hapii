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
})
