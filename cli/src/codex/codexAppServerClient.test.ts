import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn()

vi.mock('node:child_process', async () => {
    return {
        spawn: spawnMock
    }
})

vi.mock('./utils/resolveCodexExecutable', async () => {
    return {
        resolveCodexExecutable: () => ({ command: '/tmp/codex', binDir: '/tmp' }),
        buildEnvWithPrependedPath: (_env: NodeJS.ProcessEnv, binDir: string) => ({
            PATH: `${binDir}:/usr/bin:/bin`
        }),
        describeCodexCommand: (command: string) => command
    }
})

class FakeStream extends EventEmitter {
    setEncoding(): void {
    }
}

class FakeChildProcess extends EventEmitter {
    stdout = new FakeStream()
    stderr = new FakeStream()
    stdin = {
        end: vi.fn()
    }
}

describe('CodexAppServerClient', () => {
    it('spawns resolved codex command with PATH prepended', async () => {
        spawnMock.mockReturnValue(new FakeChildProcess())

        const { CodexAppServerClient } = await import('./codexAppServerClient')
        const client = new CodexAppServerClient()

        await client.connect()

        expect(spawnMock).toHaveBeenCalledWith(
            '/tmp/codex',
            ['app-server'],
            expect.objectContaining({
                env: expect.objectContaining({
                    PATH: expect.stringContaining('/tmp')
                })
            })
        )
    })
})

