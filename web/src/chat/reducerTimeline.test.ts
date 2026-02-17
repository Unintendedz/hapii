import { describe, expect, it } from 'vitest'
import type { TracedMessage } from '@/chat/tracer'
import { reduceTimeline } from '@/chat/reducerTimeline'

function createAgentTextMessage(id: string, createdAt: number, text: string): TracedMessage {
    return {
        id,
        localId: null,
        createdAt,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'text',
            text,
            uuid: id,
            parentUUID: null
        }]
    }
}

function createAgentReasoningMessage(id: string, createdAt: number, text: string): TracedMessage {
    return {
        id,
        localId: null,
        createdAt,
        role: 'agent',
        isSidechain: false,
        content: [{
            type: 'reasoning',
            text,
            uuid: id,
            parentUUID: null
        }]
    }
}

function createEventMessage(id: string, createdAt: number, message: string): TracedMessage {
    return {
        id,
        localId: null,
        createdAt,
        role: 'event',
        isSidechain: false,
        content: {
            type: 'message',
            message
        }
    }
}

function createContext(): Parameters<typeof reduceTimeline>[1] {
    return {
        permissionsById: new Map(),
        groups: new Map(),
        consumedGroupIds: new Set(),
        titleChangesByToolUseId: new Map(),
        emittedTitleChangeToolUseIds: new Set()
    }
}

describe('reduceTimeline reasoning dedupe', () => {
    it('drops reasoning that duplicates the latest assistant text', () => {
        const messages: TracedMessage[] = [
            createAgentTextMessage('m1', 1, '最终答案'),
            createAgentReasoningMessage('m2', 2, '最终答案')
        ]

        const result = reduceTimeline(messages, createContext())

        expect(result.blocks).toHaveLength(1)
        expect(result.blocks[0]).toMatchObject({
            kind: 'agent-text',
            text: '最终答案'
        })
    })

    it('collapses consecutive duplicate reasoning blocks', () => {
        const messages: TracedMessage[] = [
            createAgentReasoningMessage('m1', 1, '思路片段'),
            createAgentReasoningMessage('m2', 2, '思路片段')
        ]

        const result = reduceTimeline(messages, createContext())

        expect(result.blocks).toHaveLength(1)
        expect(result.blocks[0]).toMatchObject({
            kind: 'agent-reasoning',
            text: '思路片段'
        })
    })

    it('replaces duplicate reasoning with later normal text', () => {
        const messages: TracedMessage[] = [
            createAgentReasoningMessage('m1', 1, '同一段内容'),
            createAgentTextMessage('m2', 2, '同一段内容')
        ]

        const result = reduceTimeline(messages, createContext())

        expect(result.blocks).toHaveLength(1)
        expect(result.blocks[0]).toMatchObject({
            kind: 'agent-text',
            text: '同一段内容'
        })
    })

    it('drops status event that duplicates latest assistant text', () => {
        const messages: TracedMessage[] = [
            createAgentTextMessage('m1', 1, '探索完成，总结如下'),
            createEventMessage('m2', 2, '探索完成，总结如下')
        ]

        const result = reduceTimeline(messages, createContext())

        expect(result.blocks).toHaveLength(1)
        expect(result.blocks[0]).toMatchObject({
            kind: 'agent-text',
            text: '探索完成，总结如下'
        })
    })

    it('keeps status event when message is different', () => {
        const messages: TracedMessage[] = [
            createAgentTextMessage('m1', 1, '探索完成，总结如下'),
            createEventMessage('m2', 2, '任务已完成')
        ]

        const result = reduceTimeline(messages, createContext())

        expect(result.blocks).toHaveLength(2)
        expect(result.blocks[0]).toMatchObject({
            kind: 'agent-text',
            text: '探索完成，总结如下'
        })
        expect(result.blocks[1]).toMatchObject({
            kind: 'agent-event',
            event: {
                type: 'message',
                message: '任务已完成'
            }
        })
    })
})
