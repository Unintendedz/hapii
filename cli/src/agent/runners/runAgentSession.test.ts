import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const session = {
        keepAlive: vi.fn(),
        updateAgentState: vi.fn(),
        onUserMessage: vi.fn(),
        sendSessionDeath: vi.fn(),
        flush: vi.fn(async () => {}),
        close: vi.fn(),
    }

    const backend = {
        initialize: vi.fn(async () => {
            throw new Error('init failed')
        }),
        disconnect: vi.fn(async () => {}),
    }

    return { session, backend }
})

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async () => ({ session: mocks.session })),
}))

vi.mock('@/agent/AgentRegistry', () => ({
    AgentRegistry: {
        create: vi.fn(() => mocks.backend),
    },
}))

import { runAgentSession } from './runAgentSession'

describe('runAgentSession', () => {
    it('sends keepAlive before backend.initialize', async () => {
        await expect(runAgentSession({ agentType: 'codex' })).rejects.toThrow('init failed')

        expect(mocks.session.keepAlive).toHaveBeenCalled()
        expect(mocks.backend.initialize).toHaveBeenCalled()

        const keepAliveOrder = mocks.session.keepAlive.mock.invocationCallOrder[0]
        const initializeOrder = mocks.backend.initialize.mock.invocationCallOrder[0]
        expect(keepAliveOrder).toBeLessThan(initializeOrder)

        expect(mocks.session.sendSessionDeath).toHaveBeenCalled()
        expect(mocks.session.flush).toHaveBeenCalled()
        expect(mocks.session.close).toHaveBeenCalled()
        expect(mocks.backend.disconnect).toHaveBeenCalled()
    })
})
