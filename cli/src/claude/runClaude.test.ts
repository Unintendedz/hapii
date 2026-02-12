import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const session = {
        keepAlive: vi.fn(),
        updateMetadata: vi.fn(),
        updateAgentState: vi.fn(),
        onUserMessage: vi.fn(),
        rpcHandlerManager: {
            registerHandler: vi.fn(),
        },
    }

    const happyServer = {
        url: 'http://127.0.0.1:1234',
        toolNames: [] as string[],
        stop: vi.fn(),
    }

    const hookServer = {
        port: 9999,
        token: 'token',
        stop: vi.fn(),
    }

    const lifecycle = {
        registerProcessHandlers: vi.fn(),
        markCrash: vi.fn(),
        cleanup: vi.fn(async () => {}),
        cleanupAndExit: vi.fn(async () => {}),
        setExitCode: vi.fn(),
        setArchiveReason: vi.fn(),
    }

    return {
        session,
        happyServer,
        hookServer,
        lifecycle,
    }
})

vi.mock('@/ui/logger', () => ({
    logger: {
        debugLargeJson: vi.fn(),
        debug: vi.fn(),
        infoDeveloper: vi.fn(),
        logFilePath: '/tmp/hapi-test.log',
    },
}))

vi.mock('@/ui/doctor', () => ({
    getEnvironmentInfo: vi.fn(() => ({})),
}))

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async () => ({
        api: {},
        session: mocks.session,
        sessionInfo: { id: 'session-1' },
    })),
}))

vi.mock('@/agent/runnerLifecycle', () => ({
    setControlledByUser: vi.fn(),
    createModeChangeHandler: vi.fn(() => vi.fn()),
    createRunnerLifecycle: vi.fn(() => mocks.lifecycle),
}))

const startHappyServerMock = vi.hoisted(() => vi.fn(async () => mocks.happyServer))
vi.mock('@/claude/utils/startHappyServer', () => ({
    startHappyServer: startHappyServerMock,
}))

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: vi.fn(async () => mocks.hookServer),
}))

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    generateHookSettingsFile: vi.fn(() => '/tmp/hook-settings.json'),
    cleanupHookSettingsFile: vi.fn(),
}))

vi.mock('@/claude/sdk/metadataExtractor', () => ({
    extractSDKMetadataAsync: vi.fn(),
}))

vi.mock('./registerKillSessionHandler', () => ({
    registerKillSessionHandler: vi.fn(),
}))

vi.mock('@/claude/loop', () => ({
    loop: vi.fn(async () => {
        throw new Error('loop failed')
    }),
}))

import { runClaude } from './runClaude'

describe('runClaude', () => {
    it('sends keepAlive before starting servers', async () => {
        await expect(runClaude({ startedBy: 'runner' })).rejects.toThrow('loop failed')

        expect(mocks.session.keepAlive).toHaveBeenCalled()
        expect(startHappyServerMock).toHaveBeenCalled()

        const keepAliveOrder = mocks.session.keepAlive.mock.invocationCallOrder[0]
        const startHappyServerOrder = startHappyServerMock.mock.invocationCallOrder[0]
        expect(keepAliveOrder).toBeLessThan(startHappyServerOrder)

        const [thinking, mode] = mocks.session.keepAlive.mock.calls[0] as [boolean, string]
        expect(thinking).toBe(false)
        expect(mode).toBe('remote')
    })
})
