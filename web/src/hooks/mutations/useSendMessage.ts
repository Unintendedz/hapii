import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
    attachments?: AttachmentMetadata[]
}

type SendQueueItem = SendMessageInput & {
    optimisticSessionId: string
    optimisticApplied: boolean
}

export type QueuedComposerMessage = {
    localId: string
    text: string
    attachmentsCount: number
    status: 'sending' | 'queued'
}

type BlockedReason = 'no-api' | 'no-session'

type UseSendMessageOptions = {
    thinking?: boolean
    resolveSessionId?: (sessionId: string) => Promise<string>
    onSessionResolved?: (sessionId: string) => void
    onBlocked?: (reason: BlockedReason) => void
}

function findMessageByLocalId(
    sessionId: string,
    localId: string,
): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)
    for (const message of state.messages) {
        if (message.localId === localId) return message
    }
    for (const message of state.pending) {
        if (message.localId === localId) return message
    }
    return null
}

function getRetryPayload(message: DecryptedMessage): {
    text: string
    attachments?: AttachmentMetadata[]
} | null {
    const content = message.content as {
        role?: unknown
        content?: {
            type?: unknown
            attachments?: unknown
        }
    }

    const attachments = content.role === 'user'
        && content.content?.type === 'text'
        && Array.isArray(content.content.attachments)
        ? content.content.attachments as AttachmentMetadata[]
        : undefined

    if (!message.originalText && (!attachments || attachments.length === 0)) {
        return null
    }

    return {
        text: message.originalText ?? '',
        attachments,
    }
}

export function useSendMessage(
    api: ApiClient | null,
    sessionId: string | null,
    options?: UseSendMessageOptions
): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    retryMessage: (localId: string) => void
    isSending: boolean
    queuedMessages: QueuedComposerMessage[]
} {
    const { haptic } = usePlatform()
    const [isResolving, setIsResolving] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [queuedMessages, setQueuedMessages] = useState<QueuedComposerMessage[]>([])
    const queueRef = useRef<SendQueueItem[]>([])
    const processingRef = useRef(false)
    const awaitingTurnCompletionRef = useRef(false)
    const observedThinkingRef = useRef(false)
    const turnStartFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const flushQueueRef = useRef<(() => Promise<void>) | null>(null)
    const apiRef = useRef(api)
    const optionsRef = useRef(options)
    const resolvedSessionIdRef = useRef<string | null>(null)
    const pendingSessionResolutionRef = useRef<{
        fromSessionId: string
        toSessionId: string
    } | null>(null)

    const syncQueuedMessages = useCallback((processing = processingRef.current) => {
        setQueuedMessages(queueRef.current.map((item, index) => ({
            localId: item.localId,
            text: item.text,
            attachmentsCount: item.attachments?.length ?? 0,
            status: processing && index === 0 ? 'sending' : 'queued'
        })))
    }, [])

    useEffect(() => {
        if (!processingRef.current && queueRef.current.length === 0) {
            resolvedSessionIdRef.current = null
            pendingSessionResolutionRef.current = null
            setQueuedMessages([])
        }
    }, [sessionId])

    useEffect(() => {
        apiRef.current = api
    }, [api])

    useEffect(() => {
        optionsRef.current = options
    }, [options])

    const clearTurnStartFallbackTimer = useCallback(() => {
        if (turnStartFallbackTimerRef.current !== null) {
            clearTimeout(turnStartFallbackTimerRef.current)
            turnStartFallbackTimerRef.current = null
        }
    }, [])

    const releaseAwaitingTurnCompletion = useCallback(() => {
        clearTurnStartFallbackTimer()
        awaitingTurnCompletionRef.current = false
        observedThinkingRef.current = false
    }, [clearTurnStartFallbackTimer])

    const armAwaitingTurnCompletion = useCallback(() => {
        clearTurnStartFallbackTimer()
        awaitingTurnCompletionRef.current = true
        observedThinkingRef.current = optionsRef.current?.thinking === true

        turnStartFallbackTimerRef.current = setTimeout(() => {
            if (observedThinkingRef.current) {
                return
            }
            if (optionsRef.current?.thinking) {
                observedThinkingRef.current = true
                return
            }

            releaseAwaitingTurnCompletion()
            void flushQueueRef.current?.()
        }, 800)
    }, [clearTurnStartFallbackTimer, releaseAwaitingTurnCompletion])

    const enqueueOptimisticMessage = useCallback((input: SendQueueItem) => {
        const optimisticMessage: DecryptedMessage = {
            id: input.localId,
            seq: null,
            localId: input.localId,
            content: {
                role: 'user',
                content: {
                    type: 'text',
                    text: input.text,
                    attachments: input.attachments
                }
            },
            createdAt: input.createdAt,
            status: 'sending',
            originalText: input.text,
        }

        appendOptimisticMessage(input.optimisticSessionId, optimisticMessage)
    }, [])

    const prepareQueuedMessageForSend = useCallback((input: SendQueueItem) => {
        if (input.optimisticApplied) {
            updateMessageStatus(input.optimisticSessionId, input.localId, 'sending')
            return
        }

        enqueueOptimisticMessage(input)
        input.optimisticApplied = true
    }, [enqueueOptimisticMessage])

    const flushQueue = useCallback(async () => {
        if (processingRef.current || awaitingTurnCompletionRef.current) {
            return
        }

        processingRef.current = true
        setIsProcessing(true)
        syncQueuedMessages(true)

        try {
            while (queueRef.current.length > 0) {
                if (optionsRef.current?.thinking) {
                    break
                }

                const current = queueRef.current[0]
                const currentApi = apiRef.current

                prepareQueuedMessageForSend(current)

                if (!currentApi) {
                    updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                    haptic.notification('error')
                    queueRef.current.shift()
                    syncQueuedMessages(true)
                    continue
                }

                let targetSessionId = current.sessionId
                const currentOptions = optionsRef.current

                if (currentOptions?.resolveSessionId) {
                    setIsResolving(true)
                    try {
                        const resolvedSessionId = await currentOptions.resolveSessionId(targetSessionId)
                        if (resolvedSessionId && resolvedSessionId !== targetSessionId) {
                            resolvedSessionIdRef.current = resolvedSessionId
                            pendingSessionResolutionRef.current = {
                                fromSessionId: pendingSessionResolutionRef.current?.fromSessionId ?? current.optimisticSessionId,
                                toSessionId: resolvedSessionId,
                            }
                            for (const queued of queueRef.current) {
                                if (queued.sessionId === targetSessionId) {
                                    queued.sessionId = resolvedSessionId
                                }
                            }
                            targetSessionId = resolvedSessionId
                        }
                    } catch (error) {
                        updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                        haptic.notification('error')
                        console.error('Failed to resolve session before send:', error)
                        queueRef.current.shift()
                        syncQueuedMessages(true)
                        continue
                    } finally {
                        setIsResolving(false)
                    }
                }

                let sendStarted = false
                try {
                    await currentApi.sendMessage(targetSessionId, current.text, current.localId, current.attachments)
                    updateMessageStatus(current.optimisticSessionId, current.localId, 'sent')
                    haptic.notification('success')
                    sendStarted = true
                } catch (error) {
                    updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                    haptic.notification('error')
                    console.error('Failed to send message:', error)
                } finally {
                    queueRef.current.shift()
                    syncQueuedMessages(true)
                }

                if (sendStarted) {
                    armAwaitingTurnCompletion()
                    break
                }
            }
        } finally {
            processingRef.current = false
            setIsProcessing(false)
            syncQueuedMessages(false)

            const pendingSessionResolution = pendingSessionResolutionRef.current
            if (queueRef.current.length === 0 && pendingSessionResolution) {
                pendingSessionResolutionRef.current = null
                optionsRef.current?.onSessionResolved?.(pendingSessionResolution.toSessionId)
            }
        }
    }, [armAwaitingTurnCompletion, haptic, prepareQueuedMessageForSend, syncQueuedMessages])

    flushQueueRef.current = flushQueue

    useEffect(() => {
        const thinking = options?.thinking === true

        if (thinking) {
            if (awaitingTurnCompletionRef.current) {
                observedThinkingRef.current = true
                clearTurnStartFallbackTimer()
            }
            return
        }

        if (awaitingTurnCompletionRef.current && observedThinkingRef.current) {
            releaseAwaitingTurnCompletion()
            void flushQueueRef.current?.()
            return
        }

        if (!awaitingTurnCompletionRef.current && queueRef.current.length > 0 && !processingRef.current) {
            void flushQueueRef.current?.()
        }
    }, [options?.thinking, clearTurnStartFallbackTimer, releaseAwaitingTurnCompletion])

    useEffect(() => {
        return () => {
            clearTurnStartFallbackTimer()
        }
    }, [clearTurnStartFallbackTimer])

    const enqueueMessage = useCallback((input: SendQueueItem) => {
        queueRef.current.push(input)
        syncQueuedMessages()
        void flushQueue()
    }, [flushQueue, syncQueuedMessages])

    const sendMessage = (text: string, attachments?: AttachmentMetadata[]) => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return
        }
        const localId = makeClientSideId('local')
        const createdAt = Date.now()
        enqueueMessage({
            sessionId: resolvedSessionIdRef.current ?? sessionId,
            optimisticSessionId: sessionId,
            text,
            localId,
            createdAt,
            attachments,
            optimisticApplied: false,
        })
    }

    const retryMessage = (localId: string) => {
        if (!api) {
            options?.onBlocked?.('no-api')
            haptic.notification('error')
            return
        }
        if (!sessionId) {
            options?.onBlocked?.('no-session')
            haptic.notification('error')
            return
        }

        const message = findMessageByLocalId(sessionId, localId)
        if (!message) return

        const retryPayload = getRetryPayload(message)
        if (!retryPayload) return

        queueRef.current.push({
            sessionId: resolvedSessionIdRef.current ?? sessionId,
            optimisticSessionId: sessionId,
            text: retryPayload.text,
            localId,
            createdAt: message.createdAt,
            attachments: retryPayload.attachments,
            optimisticApplied: true,
        })
        syncQueuedMessages()
        void flushQueue()
    }

    return {
        sendMessage,
        retryMessage,
        isSending: isProcessing || isResolving || queuedMessages.length > 0,
        queuedMessages,
    }
}
