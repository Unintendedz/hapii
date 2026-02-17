import type { ChatBlock, ToolCallBlock, ToolPermission } from '@/chat/types'
import type { TracedMessage } from '@/chat/tracer'
import { createCliOutputBlock, isCliOutputText, mergeCliOutputBlocks } from '@/chat/reducerCliOutput'
import { parseMessageAsEvent } from '@/chat/reducerEvents'
import { ensureToolBlock, extractTitleFromChangeTitleInput, isChangeTitleToolName, type PermissionEntry } from '@/chat/reducerTools'

function normalizeContentText(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

type RecentAssistantContent = {
    index: number
    kind: 'agent-text' | 'agent-reasoning' | 'cli-output'
    normalizedText: string
}

function findRecentAssistantContentSinceLastUser(blocks: ChatBlock[]): RecentAssistantContent | null {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index]
        if (block.kind === 'user-text') {
            return null
        }
        if (block.kind === 'agent-text' || block.kind === 'agent-reasoning') {
            const normalizedText = normalizeContentText(block.text)
            if (normalizedText.length === 0) continue
            return {
                index,
                kind: block.kind,
                normalizedText
            }
        }
        if (block.kind === 'cli-output' && block.source === 'assistant') {
            const normalizedText = normalizeContentText(block.text)
            if (normalizedText.length === 0) continue
            return {
                index,
                kind: block.kind,
                normalizedText
            }
        }
    }
    return null
}

function shouldDropDuplicateEventMessage(blocks: ChatBlock[], message: string): boolean {
    const normalizedMessage = normalizeContentText(message)
    if (normalizedMessage.length === 0) {
        return false
    }
    const recent = findRecentAssistantContentSinceLastUser(blocks)
    if (!recent) {
        return false
    }
    return recent.normalizedText === normalizedMessage
}

export function reduceTimeline(
    messages: TracedMessage[],
    context: {
        permissionsById: Map<string, PermissionEntry>
        groups: Map<string, TracedMessage[]>
        consumedGroupIds: Set<string>
        titleChangesByToolUseId: Map<string, string>
        emittedTitleChangeToolUseIds: Set<string>
    }
): { blocks: ChatBlock[]; toolBlocksById: Map<string, ToolCallBlock>; hasReadyEvent: boolean } {
    const blocks: ChatBlock[] = []
    const toolBlocksById = new Map<string, ToolCallBlock>()
    let hasReadyEvent = false

    for (const msg of messages) {
        if (msg.role === 'event') {
            if (msg.content.type === 'ready') {
                hasReadyEvent = true
                continue
            }
            if (
                msg.content.type === 'message'
                && typeof msg.content.message === 'string'
                && shouldDropDuplicateEventMessage(blocks, msg.content.message)
            ) {
                continue
            }
            blocks.push({
                kind: 'agent-event',
                id: msg.id,
                createdAt: msg.createdAt,
                event: msg.content,
                meta: msg.meta
            })
            continue
        }

        const event = parseMessageAsEvent(msg)
        if (event) {
            if (
                event.type === 'message'
                && typeof event.message === 'string'
                && shouldDropDuplicateEventMessage(blocks, event.message)
            ) {
                continue
            }
            blocks.push({
                kind: 'agent-event',
                id: msg.id,
                createdAt: msg.createdAt,
                event,
                meta: msg.meta
            })
            continue
        }

        if (msg.role === 'user') {
            if (isCliOutputText(msg.content.text, msg.meta)) {
                blocks.push(createCliOutputBlock({
                    id: msg.id,
                    localId: msg.localId,
                    createdAt: msg.createdAt,
                    text: msg.content.text,
                    source: 'user',
                    meta: msg.meta
                }))
                continue
            }
            blocks.push({
                kind: 'user-text',
                id: msg.id,
                localId: msg.localId,
                createdAt: msg.createdAt,
                text: msg.content.text,
                attachments: msg.content.attachments,
                status: msg.status,
                originalText: msg.originalText,
                meta: msg.meta
            })
            continue
        }

        if (msg.role === 'agent') {
            for (let idx = 0; idx < msg.content.length; idx += 1) {
                const c = msg.content[idx]
                if (c.type === 'text') {
                    const normalizedText = normalizeContentText(c.text)
                    if (normalizedText.length > 0) {
                        const recent = findRecentAssistantContentSinceLastUser(blocks)
                        if (recent && recent.kind === 'agent-reasoning' && recent.normalizedText === normalizedText) {
                            blocks.splice(recent.index, 1)
                        }
                    }
                    if (isCliOutputText(c.text, msg.meta)) {
                        blocks.push(createCliOutputBlock({
                            id: `${msg.id}:${idx}`,
                            localId: msg.localId,
                            createdAt: msg.createdAt,
                            text: c.text,
                            source: 'assistant',
                            meta: msg.meta
                        }))
                        continue
                    }
                    blocks.push({
                        kind: 'agent-text',
                        id: `${msg.id}:${idx}`,
                        localId: msg.localId,
                        createdAt: msg.createdAt,
                        text: c.text,
                        meta: msg.meta
                    })
                    continue
                }

                if (c.type === 'reasoning') {
                    const normalizedText = normalizeContentText(c.text)
                    if (normalizedText.length === 0) {
                        continue
                    }
                    const recent = findRecentAssistantContentSinceLastUser(blocks)
                    if (recent && recent.normalizedText === normalizedText) {
                        continue
                    }
                    blocks.push({
                        kind: 'agent-reasoning',
                        id: `${msg.id}:${idx}`,
                        localId: msg.localId,
                        createdAt: msg.createdAt,
                        text: c.text,
                        meta: msg.meta
                    })
                    continue
                }

                if (c.type === 'summary') {
                    blocks.push({
                        kind: 'agent-event',
                        id: `${msg.id}:${idx}`,
                        createdAt: msg.createdAt,
                        event: { type: 'message', message: c.summary },
                        meta: msg.meta
                    })
                    continue
                }

                if (c.type === 'tool-call') {
                    if (isChangeTitleToolName(c.name)) {
                        const title = context.titleChangesByToolUseId.get(c.id) ?? extractTitleFromChangeTitleInput(c.input)
                        if (title && !context.emittedTitleChangeToolUseIds.has(c.id)) {
                            context.emittedTitleChangeToolUseIds.add(c.id)
                            blocks.push({
                                kind: 'agent-event',
                                id: `${msg.id}:${idx}`,
                                createdAt: msg.createdAt,
                                event: { type: 'title-changed', title },
                                meta: msg.meta
                            })
                        }
                        continue
                    }

                    const permission = context.permissionsById.get(c.id)?.permission

                    const block = ensureToolBlock(blocks, toolBlocksById, c.id, {
                        createdAt: msg.createdAt,
                        localId: msg.localId,
                        meta: msg.meta,
                        name: c.name,
                        input: c.input,
                        description: c.description,
                        permission
                    })

                    if (block.tool.state === 'pending') {
                        block.tool.state = 'running'
                        block.tool.startedAt = msg.createdAt
                    }

                    if (c.name === 'Task' && !context.consumedGroupIds.has(msg.id)) {
                        const sidechain = context.groups.get(msg.id) ?? null
                        if (sidechain && sidechain.length > 0) {
                            context.consumedGroupIds.add(msg.id)
                            const child = reduceTimeline(sidechain, context)
                            hasReadyEvent = hasReadyEvent || child.hasReadyEvent
                            block.children = child.blocks
                        }
                    }
                    continue
                }

                if (c.type === 'tool-result') {
                    const title = context.titleChangesByToolUseId.get(c.tool_use_id) ?? null
                    if (title) {
                        if (!context.emittedTitleChangeToolUseIds.has(c.tool_use_id)) {
                            context.emittedTitleChangeToolUseIds.add(c.tool_use_id)
                            blocks.push({
                                kind: 'agent-event',
                                id: `${msg.id}:${idx}`,
                                createdAt: msg.createdAt,
                                event: { type: 'title-changed', title },
                                meta: msg.meta
                            })
                        }
                        continue
                    }

                    const permissionEntry = context.permissionsById.get(c.tool_use_id)
                    const permissionFromResult = c.permissions ? ({
                        id: c.tool_use_id,
                        status: c.permissions.result === 'approved' ? 'approved' : 'denied',
                        date: c.permissions.date,
                        mode: c.permissions.mode,
                        allowedTools: c.permissions.allowedTools,
                        decision: c.permissions.decision
                    } satisfies ToolPermission) : undefined

                    const permission = (() => {
                        if (permissionFromResult && permissionEntry?.permission) {
                            return {
                                ...permissionEntry.permission,
                                ...permissionFromResult,
                                allowedTools: permissionFromResult.allowedTools ?? permissionEntry.permission.allowedTools,
                                decision: permissionFromResult.decision ?? permissionEntry.permission.decision
                            } satisfies ToolPermission
                        }
                        return permissionFromResult ?? permissionEntry?.permission
                    })()

                    const block = ensureToolBlock(blocks, toolBlocksById, c.tool_use_id, {
                        createdAt: msg.createdAt,
                        localId: msg.localId,
                        meta: msg.meta,
                        name: permissionEntry?.toolName ?? 'Tool',
                        input: permissionEntry?.input ?? null,
                        description: null,
                        permission
                    })

                    block.tool.result = c.content
                    block.tool.completedAt = msg.createdAt
                    block.tool.state = c.is_error ? 'error' : 'completed'
                    continue
                }

                if (c.type === 'sidechain') {
                    blocks.push({
                        kind: 'user-text',
                        id: `${msg.id}:${idx}`,
                        localId: null,
                        createdAt: msg.createdAt,
                        text: c.prompt
                    })
                }
            }
        }
    }

    return { blocks: mergeCliOutputBlocks(blocks), toolBlocksById, hasReadyEvent }
}
