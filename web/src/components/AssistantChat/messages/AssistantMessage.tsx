import { useState } from 'react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { MessageActionMenu } from '@/components/AssistantChat/messages/MessageActionMenu'
import { MessageSelectDialog } from '@/components/AssistantChat/messages/MessageSelectDialog'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

export function HappyAssistantMessage() {
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState({ x: 0, y: 0 })
    const [selectOpen, setSelectOpen] = useState(false)

    const messageId = useAssistantState(({ message }) => message.id)
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const textContent = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return ''
        return message.content
            .filter((part) => part.type === 'text')
            .map((part) => (part as { type: 'text'; text: string }).text)
            .join('\n')
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        disabled: toolOnly,
        threshold: 500
    })

    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                className="px-1 min-w-0 max-w-full overflow-x-hidden"
                style={{ WebkitTouchCallout: 'none' }}
                data-hapi-message-id={messageId}
                {...longPressHandlers}
            >
                <CliOutputBlock text={cliText} />
                <MessageActionMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    anchorPoint={menuAnchorPoint}
                    text={cliText}
                    onSelectText={() => setSelectOpen(true)}
                />
                <MessageSelectDialog
                    isOpen={selectOpen}
                    onClose={() => setSelectOpen(false)}
                    text={cliText}
                />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root
            className={rootClass}
            style={{ WebkitTouchCallout: 'none' }}
            data-hapi-message-id={messageId}
            {...longPressHandlers}
        >
            <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
            <MessageActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                anchorPoint={menuAnchorPoint}
                text={textContent}
                onSelectText={() => setSelectOpen(true)}
            />
            <MessageSelectDialog
                isOpen={selectOpen}
                onClose={() => setSelectOpen(false)}
                text={textContent}
            />
        </MessagePrimitive.Root>
    )
}
