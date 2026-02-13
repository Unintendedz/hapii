import { describe, expect, it } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode } from '../loop'
import { enqueueCodexUserMessage } from '../runCodex'

function createQueue(): MessageQueue2<EnhancedMode> {
    return new MessageQueue2<EnhancedMode>(() => 'mode')
}

describe('enqueueCodexUserMessage', () => {
    const mode: EnhancedMode = {
        permissionMode: 'default'
    }

    it('pushes /new as isolated and clears pending messages', () => {
        const queue = createQueue()
        queue.push('hello', mode)

        enqueueCodexUserMessage({
            messageQueue: queue,
            rawText: '/new',
            formattedText: '/new',
            enhancedMode: mode
        })

        expect(queue.queue).toHaveLength(1)
        expect(queue.queue[0].message).toBe('/new')
        expect(queue.queue[0].isolate).toBe(true)
    })

    it('pushes non-/new messages normally without clearing', () => {
        const queue = createQueue()
        queue.push('first', mode)

        enqueueCodexUserMessage({
            messageQueue: queue,
            rawText: 'second',
            formattedText: 'second (formatted)',
            enhancedMode: mode
        })

        expect(queue.queue).toHaveLength(2)
        expect(queue.queue[0].message).toBe('first')
        expect(queue.queue[1].message).toBe('second (formatted)')
        expect(queue.queue[1].isolate).toBe(false)
    })

    it('keeps /new remainder intact while isolating', () => {
        const queue = createQueue()
        queue.push('first', mode)

        enqueueCodexUserMessage({
            messageQueue: queue,
            rawText: '/new hello',
            formattedText: '/new hello',
            enhancedMode: mode
        })

        expect(queue.queue).toHaveLength(1)
        expect(queue.queue[0].message).toBe('/new hello')
        expect(queue.queue[0].isolate).toBe(true)
    })
})

