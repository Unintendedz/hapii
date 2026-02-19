import { describe, expect, it, vi } from 'vitest'
import { PermissionHandler } from './permissionHandler'
import type { Session } from '../session'
import type { ClaudePermissionMode } from '@hapi/protocol/types'

function createTestHandler(initialMode: ClaudePermissionMode = 'default') {
    let runtimeMode: ClaudePermissionMode = initialMode
    let state: Record<string, unknown> = {}

    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler: vi.fn()
            },
            updateAgentState: vi.fn((updater: (s: Record<string, unknown>) => Record<string, unknown>) => {
                state = updater(state)
            })
        },
        setPermissionMode: vi.fn((mode: ClaudePermissionMode) => {
            runtimeMode = mode
        }),
        getPermissionMode: vi.fn(() => runtimeMode),
        queue: {
            unshift: vi.fn()
        }
    } as unknown as Session

    const handler = new PermissionHandler(session)

    return {
        handler,
        setRuntimeMode: (mode: ClaudePermissionMode) => {
            runtimeMode = mode
        }
    }
}

describe('PermissionHandler runtime permission mode sync', () => {
    it('auto-approves Bash after runtime mode changes to bypassPermissions', async () => {
        const { handler, setRuntimeMode } = createTestHandler('default')
        handler.handleModeChange('default')
        setRuntimeMode('bypassPermissions')

        const result = await handler.handleToolCall(
            'Bash',
            { command: 'pwd' },
            { permissionMode: 'default' },
            { signal: new AbortController().signal }
        )

        expect(result.behavior).toBe('allow')
    })

    it('auto-approves edit tools after runtime mode changes to acceptEdits', async () => {
        const { handler, setRuntimeMode } = createTestHandler('default')
        handler.handleModeChange('default')
        setRuntimeMode('acceptEdits')

        const result = await handler.handleToolCall(
            'Edit',
            { file_path: 'a.txt', old_string: 'a', new_string: 'b' },
            { permissionMode: 'default' },
            { signal: new AbortController().signal }
        )

        expect(result.behavior).toBe('allow')
    })
})
