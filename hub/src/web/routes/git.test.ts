import { describe, expect, it, mock } from 'bun:test'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import { createGitRoutes } from './git'

function makeSession(path: string, homeDir?: string): Session {
    return {
        id: 'session-1',
        namespace: 'test',
        active: true,
        thinking: false,
        activeAt: 1,
        updatedAt: 1,
        metadata: {
            path,
            homeDir,
            host: 'host',
        },
        agentState: { requests: {} }
    } as Session
}

describe('createGitRoutes', () => {
    it('refuses file search when the session root is the home directory', async () => {
        const runRipgrep = mock(async () => ({
            success: true,
            stdout: '',
            stderr: '',
            exitCode: 0
        }))

        const engine = {
            resolveSessionAccess: () => ({
                ok: true,
                sessionId: 'session-1',
                session: makeSession('/Users/x', '/Users/x')
            }),
            runRipgrep,
        } as unknown as SyncEngine

        const app = createGitRoutes(() => engine)
        const response = await app.request('http://localhost/sessions/session-1/files?query=src')

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            success: false,
            error: 'File search is disabled for sessions started from your home/root directory. Start the session inside a project folder instead.'
        })
        expect(runRipgrep.mock.calls.length).toBe(0)
    })
})
