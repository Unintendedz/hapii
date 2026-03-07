import { describe, expect, it } from 'bun:test'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import { createSessionsRoutes } from './sessions'

function makeSession(options: {
    id: string
    active: boolean
    lifecycleState?: string
    archivedBy?: string
    updatedAt: number
}): Session {
    return {
        id: options.id,
        namespace: 'test',
        active: options.active,
        thinking: false,
        activeAt: options.updatedAt,
        updatedAt: options.updatedAt,
        metadata: {
            path: `/projects/${options.id}`,
            host: 'host',
            lifecycleState: options.lifecycleState,
            archivedBy: options.archivedBy
        },
        agentState: { requests: {} }
    } as Session
}

describe('createSessionsRoutes /sessions archive filtering', () => {
    it('treats only lifecycle-archived sessions as archived', async () => {
        const engine = {
            getSessionsByNamespace: () => [
                makeSession({
                    id: 'running-active',
                    active: true,
                    lifecycleState: 'running',
                    updatedAt: 3_000
                }),
                makeSession({
                    id: 'running-inactive',
                    active: false,
                    lifecycleState: 'running',
                    updatedAt: 2_000
                }),
                makeSession({
                    id: 'archived',
                    active: false,
                    lifecycleState: 'archived',
                    archivedBy: 'hub',
                    updatedAt: 1_000
                }),
            ]
        } as unknown as SyncEngine

        const app = createSessionsRoutes(() => engine)

        const unarchivedResponse = await app.request('http://localhost/sessions?archived=false')
        expect(unarchivedResponse.status).toBe(200)
        await expect(unarchivedResponse.json()).resolves.toMatchObject({
            sessions: [
                { id: 'running-active', active: true },
                { id: 'running-inactive', active: false },
            ]
        })

        const archivedResponse = await app.request('http://localhost/sessions?archived=true')
        expect(archivedResponse.status).toBe(200)
        await expect(archivedResponse.json()).resolves.toMatchObject({
            sessions: [
                { id: 'archived', active: false }
            ]
        })
    })
})
