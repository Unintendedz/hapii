import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SSEManager } from '../sse/sseManager'
import { VisibilityTracker } from '../visibility/visibilityTracker'
import { SyncEngine } from './syncEngine'

function createEngine(store: Store): SyncEngine {
    const io = {
        of: () => ({
            to: () => ({ emit: () => {} }),
        })
    } as any

    return new SyncEngine(
        store,
        io,
        new RpcRegistry(),
        new SSEManager(0, new VisibilityTracker())
    )
}

describe('SyncEngine listSlashCommands/listSkills RPC fallback', () => {
    it('uses machine-scoped RPC when session is inactive but has machineId', async () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession(
            'tag',
            { path: '/tmp/project', host: 'test', machineId: 'machine-1', flavor: 'codex' },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            const calls: Array<{ machineId: string; agent: string; cwd: string }> = []
            ;(engine as any).rpcGateway = {
                listSlashCommandsOnMachine: async (machineId: string, agent: string, cwd: string) => {
                    calls.push({ machineId, agent, cwd })
                    return { success: true, commands: [] }
                },
            }

            const result = await engine.listSlashCommands(stored.id, 'codex')
            expect(result.success).toBe(true)
            expect(calls).toEqual([{ machineId: 'machine-1', agent: 'codex', cwd: '/tmp/project' }])
        } finally {
            engine.stop()
        }
    })

    it('falls back to session-scoped RPC when machine-scoped RPC fails and session is active', async () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession(
            'tag',
            { path: '/tmp/project', host: 'test', machineId: 'machine-1', flavor: 'codex' },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            const session = engine.getSession(stored.id)
            expect(session).toBeDefined()
            if (session) {
                session.active = true
            }

            let machineCalls = 0
            let sessionCalls = 0
            ;(engine as any).rpcGateway = {
                listSlashCommandsOnMachine: async () => {
                    machineCalls += 1
                    throw new Error('machine offline')
                },
                listSlashCommands: async () => {
                    sessionCalls += 1
                    return { success: true, commands: [{ name: 'x', source: 'user' }] }
                }
            }

            const result = await engine.listSlashCommands(stored.id, 'codex')
            expect(result.success).toBe(true)
            expect(machineCalls).toBe(1)
            expect(sessionCalls).toBe(1)
        } finally {
            engine.stop()
        }
    })

    it('uses machine-scoped RPC for skills when session is inactive but has machineId', async () => {
        const store = new Store(':memory:')
        const stored = store.sessions.getOrCreateSession(
            'tag',
            { path: '/tmp/project', host: 'test', machineId: 'machine-1', flavor: 'codex' },
            null,
            'default'
        )

        const engine = createEngine(store)
        try {
            let calls = 0
            ;(engine as any).rpcGateway = {
                listSkillsOnMachine: async () => {
                    calls += 1
                    return { success: true, skills: [{ name: 'skill', description: 'desc' }] }
                },
            }

            const result = await engine.listSkills(stored.id)
            expect(result.success).toBe(true)
            expect(calls).toBe(1)
        } finally {
            engine.stop()
        }
    })
})

