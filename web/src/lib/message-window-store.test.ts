import { beforeEach, describe, expect, it } from 'vitest'
import type { DecryptedMessage } from '@/types/api'
import {
    clearMessageWindow,
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
            role: 'agent',
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
