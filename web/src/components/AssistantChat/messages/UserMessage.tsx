import { useState } from 'react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { MessageActionMenu } from '@/components/AssistantChat/messages/MessageActionMenu'
import { MessageSelectDialog } from '@/components/AssistantChat/messages/MessageSelectDialog'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'

export function HappyUserMessage() {
    const ctx = useHappyChatContext()
    const { haptic } = usePlatform()
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState({ x: 0, y: 0 })
    const [selectOpen, setSelectOpen] = useState(false)

    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'user') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const status = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.status
    })
    const localId = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.localId ?? null
    })
    const attachments = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.attachments
    })
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            setMenuAnchorPoint(point)
            setMenuOpen(true)
        },
        threshold: 500
    })

    if (role !== 'user') return null
    const canRetry = status === 'failed' && typeof localId === 'string' && Boolean(ctx.onRetryMessage)
    const onRetry = canRetry ? () => ctx.onRetryMessage!(localId) : undefined

    const userBubbleClass = 'w-fit min-w-0 max-w-[92%] ml-auto rounded-xl bg-[var(--app-secondary-bg)] px-3 py-2 text-[var(--app-fg)] shadow-sm'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root className="px-1 min-w-0 max-w-full overflow-x-hidden" data-hapi-message-id={messageId}>
                <div className="ml-auto w-full max-w-[92%]" style={{ WebkitTouchCallout: 'none' }} {...longPressHandlers}>
                    <CliOutputBlock text={cliText} />
                </div>
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

    const hasText = text.length > 0
    const hasAttachments = attachments && attachments.length > 0

    return (
        <MessagePrimitive.Root
            className={userBubbleClass}
            style={{ WebkitTouchCallout: 'none' }}
            data-hapi-message-id={messageId}
            {...longPressHandlers}
        >
            <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                    {hasText && <LazyRainbowText text={text} />}
                    {hasAttachments && <MessageAttachments attachments={attachments} />}
                </div>
                {status ? (
                    <div className="shrink-0 self-end pb-0.5">
                        <MessageStatusIndicator status={status} onRetry={onRetry} />
                    </div>
                ) : null}
            </div>
            <MessageActionMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                anchorPoint={menuAnchorPoint}
                text={text}
                onSelectText={() => setSelectOpen(true)}
            />
            <MessageSelectDialog
                isOpen={selectOpen}
                onClose={() => setSelectOpen(false)}
                text={text}
            />
        </MessagePrimitive.Root>
    )
}
