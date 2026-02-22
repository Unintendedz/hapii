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

function seedMachine(store: Store, machineId: string): void {
    store.machines.getOrCreateMachine(
        machineId,
        {
            host: 'test-host',
            platform: 'darwin',
            happyCliVersion: 'test'
        },
        null,
        'default'
    )
}

function seedResumableSession(store: Store, tag: string, machineId: string): { id: string } {
    return store.sessions.getOrCreateSession(
        tag,
        {
            path: '/tmp/project',
            host: 'test-host',
            machineId,
            flavor: 'codex',
            codexSessionId: 'resume-token'
        },
        null,
        'default'
    )
}

describe('SyncEngine resumeSession runtime config restore', () => {
    it('restores runtime config when resume creates a replacement session', async () => {
        const store = new Store(':memory:')
        const machineId = 'machine-1'
        seedMachine(store, machineId)

        const oldSession = seedResumableSession(store, 'old-session', machineId)
        const newSession = seedResumableSession(store, 'new-session', machineId)
        const persisted = store.sessions.updateSessionRuntimeConfig(
            oldSession.id,
            {
                runtimeConfigVersion: 4,
                permissionMode: 'yolo',
                modelMode: null,
                reasoningEffort: 'high'
            },
            'default'
        )
        expect(persisted).toBe(true)

        const engine = createEngine(store)
        try {
            engine.handleMachineAlive({ machineId, time: Date.now() })

            const sourceSession = engine.getSession(oldSession.id)
            expect(sourceSession).toBeDefined()
            if (!sourceSession) {
                throw new Error('Source session missing in cache')
            }
            expect(sourceSession.permissionMode).toBe('yolo')
            expect(sourceSession.reasoningEffort).toBe('high')
            expect(sourceSession.runtimeConfigVersion).toBe(4)

            const requestSessionConfigCalls: Array<{
                sessionId: string
                config: Record<string, unknown>
            }> = []

            ;(engine as any).rpcGateway = {
                spawnSession: async () => ({ type: 'success', sessionId: newSession.id }),
                requestSessionConfig: async (sessionId: string, config: Record<string, unknown>) => {
                    requestSessionConfigCalls.push({ sessionId, config })
                    return {
                        applied: {
                            runtimeConfigVersion: config.runtimeConfigVersion,
                            permissionMode: config.permissionMode,
                            reasoningEffort: config.reasoningEffort
                        }
                    }
                }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(oldSession.id, 'default')
            expect(result).toEqual({ type: 'success', sessionId: newSession.id })

            expect(requestSessionConfigCalls).toHaveLength(1)
            expect(requestSessionConfigCalls[0]?.sessionId).toBe(newSession.id)
            expect(requestSessionConfigCalls[0]?.config.permissionMode).toBe('yolo')
            expect(requestSessionConfigCalls[0]?.config.reasoningEffort).toBe('high')
            expect(typeof requestSessionConfigCalls[0]?.config.runtimeConfigVersion).toBe('number')

            const resumed = engine.getSession(newSession.id)
            expect(resumed?.permissionMode).toBe('yolo')
            expect(resumed?.reasoningEffort).toBe('high')
            expect(typeof resumed?.runtimeConfigVersion).toBe('number')
            expect(engine.getSession(oldSession.id)).toBeUndefined()
        } finally {
            engine.stop()
        }
    })

    it('does not request config restore when source session has no runtime config', async () => {
        const store = new Store(':memory:')
        const machineId = 'machine-2'
        seedMachine(store, machineId)

        const oldSession = seedResumableSession(store, 'old-session-no-config', machineId)
        const newSession = seedResumableSession(store, 'new-session-no-config', machineId)

        const engine = createEngine(store)
        try {
            engine.handleMachineAlive({ machineId, time: Date.now() })

            let requestSessionConfigCalled = false
            ;(engine as any).rpcGateway = {
                spawnSession: async () => ({ type: 'success', sessionId: newSession.id }),
                requestSessionConfig: async () => {
                    requestSessionConfigCalled = true
                    throw new Error('unexpected set-session-config call')
                }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(oldSession.id, 'default')
            expect(result).toEqual({ type: 'success', sessionId: newSession.id })
            expect(requestSessionConfigCalled).toBe(false)
        } finally {
            engine.stop()
        }
    })

    it('reuses an existing active session with the same resume token instead of spawning a duplicate', async () => {
        const store = new Store(':memory:')
        const machineId = 'machine-3'
        seedMachine(store, machineId)

        const oldSession = seedResumableSession(store, 'old-session-duplicate-guard', machineId)
        const existingActiveSession = seedResumableSession(store, 'existing-active-session', machineId)

        const engine = createEngine(store)
        try {
            engine.handleMachineAlive({ machineId, time: Date.now() })
            engine.handleSessionAlive({ sid: existingActiveSession.id, time: Date.now(), thinking: false })

            let spawnCalled = false
            ;(engine as any).rpcGateway = {
                spawnSession: async () => {
                    spawnCalled = true
                    return { type: 'success', sessionId: 'unexpected-new-session' }
                },
                requestSessionConfig: async () => ({ applied: { runtimeConfigVersion: 1 } })
            }

            const result = await engine.resumeSession(oldSession.id, 'default')
            expect(result).toEqual({ type: 'success', sessionId: existingActiveSession.id })
            expect(spawnCalled).toBe(false)
            expect(engine.getSession(oldSession.id)).toBeUndefined()
            expect(engine.getSession(existingActiveSession.id)?.active).toBe(true)
        } finally {
            engine.stop()
        }
    })

    it('keeps resume successful when runtime config restore fails', async () => {
        const store = new Store(':memory:')
        const machineId = 'machine-4'
        seedMachine(store, machineId)

        const oldSession = seedResumableSession(store, 'old-session-config-error', machineId)
        const newSession = seedResumableSession(store, 'new-session-config-error', machineId)
        const persisted = store.sessions.updateSessionRuntimeConfig(
            oldSession.id,
            {
                runtimeConfigVersion: 2,
                permissionMode: 'acceptEdits',
                modelMode: null,
                reasoningEffort: null
            },
            'default'
        )
        expect(persisted).toBe(true)

        const engine = createEngine(store)
        try {
            engine.handleMachineAlive({ machineId, time: Date.now() })

            ;(engine as any).rpcGateway = {
                spawnSession: async () => ({ type: 'success', sessionId: newSession.id }),
                requestSessionConfig: async () => {
                    throw new Error('set-session-config unavailable')
                }
            }
            ;(engine as any).waitForSessionActive = async () => true

            const result = await engine.resumeSession(oldSession.id, 'default')
            expect(result).toEqual({ type: 'success', sessionId: newSession.id })
            expect(engine.getSession(oldSession.id)).toBeUndefined()
            expect(engine.getSession(newSession.id)).toBeDefined()
        } finally {
            engine.stop()
        }
    })
})
