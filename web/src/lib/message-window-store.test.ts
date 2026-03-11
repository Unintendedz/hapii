import type { ApiClient } from '@/api/client'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
    clearMessageWindow,
    fetchLatestMessages,
    getMessageWindowState,
    ingestIncomingMessages,
    seedMessageWindowFromSession,
    setAtBottom
} from '@/lib/message-window-store'

function makeMessage(args: {
    id: string
    seq: number
    createdAt: number
    role: 'user' | 'agent'
    text: string
}): DecryptedMessage {
    return {
        id: args.id,
        seq: args.seq,
        localId: null,
        createdAt: args.createdAt,
        content: {
            role: args.role,
            content: {
                type: 'text',
                text: args.text
            }
        }
    }
}

describe('seedMessageWindowFromSession', () => {
    const sourceSessionId = 'session-source'
    const targetSessionId = 'session-target'

    beforeEach(() => {
        clearMessageWindow(sourceSessionId)
        clearMessageWindow(targetSessionId)
    })

    it('does not carry over pending buffer or atBottom state', () => {
        const visible = makeMessage({
            id: 'm-visible',
            seq: 1,
            createdAt: 1,
            role: 'agent',
            text: 'visible'
        })
        const pending = makeMessage({
            id: 'm-pending',
            seq: 2,
            createdAt: 2,
            role: 'user',
            text: 'pending'
        })

        ingestIncomingMessages(sourceSessionId, [visible])
        setAtBottom(sourceSessionId, false)
        ingestIncomingMessages(sourceSessionId, [pending])

        const sourceState = getMessageWindowState(sourceSessionId)
        expect(sourceState.messages.map((message) => message.id)).toEqual(['m-visible'])
        expect(sourceState.pending.map((message) => message.id)).toEqual(['m-pending'])
        expect(sourceState.atBottom).toBe(false)

        seedMessageWindowFromSession(sourceSessionId, targetSessionId)
        const targetState = getMessageWindowState(targetSessionId)

        expect(targetState.messages.map((message) => message.id)).toEqual(['m-visible'])
        expect(targetState.pending).toEqual([])
        expect(targetState.pendingCount).toBe(0)
        expect(targetState.atBottom).toBe(true)
        expect(targetState.warning).toBeNull()
    })
})

describe('fetchLatestMessages while scrolled away', () => {
    const sessionId = 'session-fetch-latest'

    beforeEach(() => {
        clearMessageWindow(sessionId)
    })

    it('keeps assistant messages visible instead of buffering them in pending', async () => {
        ingestIncomingMessages(sessionId, [
            makeMessage({
                id: 'm1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: '1'
            })
        ])
        setAtBottom(sessionId, false)

        const api = {
            async getMessages() {
                return {
                    messages: [
                        makeMessage({
                            id: 'm1',
                            seq: 1,
                            createdAt: 1,
                            role: 'user',
                            text: '1'
                        }),
                        makeMessage({
                            id: 'm2',
                            seq: 2,
                            createdAt: 2,
                            role: 'agent',
                            text: '1'
                        })
                    ],
                    page: {
                        limit: 50,
                        beforeSeq: null,
                        nextBeforeSeq: null,
                        hasMore: false
                    }
                }
            }
        } as Pick<ApiClient, 'getMessages'> as ApiClient

        await fetchLatestMessages(api, sessionId)

        const state = getMessageWindowState(sessionId)
        expect(state.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
        expect(state.pending).toEqual([])
    })

    it('self-heals previously buffered assistant messages on refresh', async () => {
        ingestIncomingMessages(sessionId, [
            makeMessage({
                id: 'm1',
                seq: 1,
                createdAt: 1,
                role: 'user',
                text: '1'
            })
        ])
        setAtBottom(sessionId, false)

        const staleAssistant = makeMessage({
            id: 'm2',
            seq: 2,
            createdAt: 2,
            role: 'agent',
            text: '1'
        })

        const currentUser = makeMessage({
            id: 'm3',
            seq: 3,
            createdAt: 3,
            role: 'user',
            text: '2'
        })

        const api = {
            async getMessages() {
                return {
                    messages: [staleAssistant, currentUser],
                    page: {
                        limit: 50,
                        beforeSeq: null,
                        nextBeforeSeq: null,
                        hasMore: false
                    }
                }
            }
        } as Pick<ApiClient, 'getMessages'> as ApiClient

        await fetchLatestMessages(api, sessionId)

        const state = getMessageWindowState(sessionId)
        expect(state.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
        expect(state.pending.map((message) => message.id)).toEqual(['m3'])
    })
})
