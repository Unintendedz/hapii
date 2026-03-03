import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useSSE } from './useSSE'

class FakeEventSource {
    static instances: FakeEventSource[] = []
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2

    readonly withCredentials = false
    readonly url: string
    readyState = FakeEventSource.CONNECTING

    onmessage: ((event: MessageEvent<string>) => void) | null = null
    onopen: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null

    constructor(url: string) {
        this.url = url
        FakeEventSource.instances.push(this)
    }

    close(): void {
        this.readyState = FakeEventSource.CLOSED
    }

    emitOpen(): void {
        this.readyState = FakeEventSource.OPEN
        this.onopen?.({} as Event)
    }

    emitMessage(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>)
    }

    emitError(): void {
        this.onerror?.({} as Event)
    }
}

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })

    return function Wrapper(props: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

describe('useSSE', () => {
    beforeEach(() => {
        FakeEventSource.instances = []
        vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('ignores stale event source callbacks after subscription changes', () => {
        const onEvent = vi.fn()
        const onConnect = vi.fn()
        const onDisconnect = vi.fn()
        const onError = vi.fn()

        const { result, rerender } = renderHook(
            (props: { sessionId: string }) => useSSE({
                enabled: true,
                token: 'token',
                baseUrl: 'http://127.0.0.1:3006',
                subscription: { sessionId: props.sessionId },
                onEvent,
                onConnect,
                onDisconnect,
                onError
            }),
            {
                initialProps: { sessionId: 'session-1' },
                wrapper: createWrapper()
            }
        )

        const first = FakeEventSource.instances[0]
        expect(first).toBeDefined()

        act(() => {
            first.emitOpen()
            first.emitMessage({
                type: 'connection-changed',
                data: { status: 'connected', subscriptionId: 'sub-1' }
            })
        })

        expect(result.current.subscriptionId).toBe('sub-1')
        expect(onConnect).toHaveBeenCalledTimes(1)
        expect(onEvent).toHaveBeenCalledTimes(1)

        rerender({ sessionId: 'session-2' })

        const second = FakeEventSource.instances[1]
        expect(second).toBeDefined()

        act(() => {
            second.emitMessage({
                type: 'connection-changed',
                data: { status: 'connected', subscriptionId: 'sub-2' }
            })
        })

        expect(result.current.subscriptionId).toBe('sub-2')
        expect(onEvent).toHaveBeenCalledTimes(2)

        act(() => {
            first.emitMessage({
                type: 'connection-changed',
                data: { status: 'connected', subscriptionId: 'stale-sub' }
            })
            first.emitOpen()
            first.emitError()
        })

        expect(result.current.subscriptionId).toBe('sub-2')
        expect(onEvent).toHaveBeenCalledTimes(2)
        expect(onConnect).toHaveBeenCalledTimes(1)
        expect(onDisconnect).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
    })
})
