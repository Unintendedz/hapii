import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const query = vi.fn()
    const claudeCheckSession = vi.fn(() => true)
    const awaitFileExist = vi.fn(async () => true)

    return {
        query,
        claudeCheckSession,
        awaitFileExist
    }
})

vi.mock('@/claude/sdk', () => {
    class AbortError extends Error {}
    return {
        query: mocks.query,
        AbortError
    }
})

vi.mock('./utils/claudeCheckSession', () => ({
    claudeCheckSession: mocks.claudeCheckSession
}))

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: mocks.awaitFileExist
}))

import { claudeRemote } from './claudeRemote'

function asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const item of items) {
                yield item
            }
        }
    }
}

describe('claudeRemote result event forwarding', () => {
    it('forwards non-empty result text via onCompletionEvent', async () => {
        mocks.query.mockReturnValue(asyncIterableFrom([
            {
                type: 'result',
                subtype: 'success',
                is_error: false,
                duration_ms: 1,
                duration_api_ms: 0,
                num_turns: 1,
                result: 'Unknown skill: bmad-master',
                stop_reason: null,
                session_id: 'session-1',
                total_cost_usd: 0,
                modelUsage: {},
                permission_denials: [],
                uuid: 'result-1'
            }
        ]))

        const nextMessage = vi.fn()
            .mockResolvedValueOnce({
                message: '/bmad-master',
                mode: { permissionMode: 'default' as const }
            })
            .mockResolvedValueOnce(null)
        const onCompletionEvent = vi.fn()

        await claudeRemote({
            sessionId: null,
            path: process.cwd(),
            allowedTools: [],
            hookSettingsPath: '/tmp/hapi-hook-settings.json',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            nextMessage,
            onReady: vi.fn(),
            isAborted: () => false,
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent
        })

        expect(onCompletionEvent).toHaveBeenCalledWith('Unknown skill: bmad-master')
    })

    it('does not forward empty result text', async () => {
        mocks.query.mockReturnValue(asyncIterableFrom([
            {
                type: 'result',
                subtype: 'success',
                is_error: false,
                duration_ms: 1,
                duration_api_ms: 0,
                num_turns: 1,
                result: '',
                stop_reason: null,
                session_id: 'session-1',
                total_cost_usd: 0,
                modelUsage: {},
                permission_denials: [],
                uuid: 'result-2'
            }
        ]))

        const nextMessage = vi.fn()
            .mockResolvedValueOnce({
                message: 'hello',
                mode: { permissionMode: 'default' as const }
            })
            .mockResolvedValueOnce(null)
        const onCompletionEvent = vi.fn()

        await claudeRemote({
            sessionId: null,
            path: process.cwd(),
            allowedTools: [],
            hookSettingsPath: '/tmp/hapi-hook-settings.json',
            canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
            nextMessage,
            onReady: vi.fn(),
            isAborted: () => false,
            onSessionFound: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent
        })

        expect(onCompletionEvent).not.toHaveBeenCalled()
    })
})
