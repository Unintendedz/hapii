import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AbortError } from './types'

const mocks = vi.hoisted(() => {
    const spawn = vi.fn()
    const killProcessByChildProcess = vi.fn(async (child: { killed?: boolean }) => {
        child.killed = true
        return true
    })
    return {
        spawn,
        killProcessByChildProcess
    }
})

vi.mock('node:child_process', () => ({
    spawn: mocks.spawn
}))

vi.mock('@/utils/process', () => ({
    killProcessByChildProcess: mocks.killProcessByChildProcess
}))

vi.mock('@/utils/bunRuntime', () => ({
    withBunRuntimeEnv: (env: NodeJS.ProcessEnv) => env
}))

vi.mock('../utils/mcpConfig', () => ({
    appendMcpConfigArg: () => null
}))

import { query } from './query'

class FakeChildProcess extends EventEmitter {
    stdin = new PassThrough()
    stdout = new PassThrough()
    stderr = new PassThrough()
    killed = false
    pid = 12345
}

describe('claude sdk query exit handling', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    it('cleans up and surfaces non-zero exits', async () => {
        const child = new FakeChildProcess()
        mocks.spawn.mockReturnValue(child as any)

        const response = query({
            prompt: 'hello',
            options: {
                pathToClaudeCodeExecutable: 'claude'
            }
        })

        const nextPromise = response.next()

        child.stdout.end()
        child.emit('close', 1)

        await expect(nextPromise).rejects.toThrow('Claude Code process exited with code 1')
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(mocks.killProcessByChildProcess).toHaveBeenCalledTimes(1)
    })

    it('prefers AbortError when aborted', async () => {
        const child = new FakeChildProcess()
        mocks.spawn.mockReturnValue(child as any)

        const abortController = new AbortController()
        const response = query({
            prompt: 'hello',
            options: {
                abort: abortController.signal,
                pathToClaudeCodeExecutable: 'claude'
            }
        })

        const nextPromise = response.next()

        abortController.abort()
        child.stdout.end()
        child.emit('close', 143)

        await expect(nextPromise).rejects.toBeInstanceOf(AbortError)
    })
})
