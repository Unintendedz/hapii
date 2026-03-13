import { useCallback, useEffect, useSyncExternalStore } from 'react'
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

type QueueSnapshot = {
    queuedMessages: QueuedComposerMessage[]
    isProcessing: boolean
    isResolving: boolean
    isQueuePaused: boolean
}

type QueueStore = {
    key: string
    queue: SendQueueItem[]
    snapshot: QueueSnapshot
    listeners: Set<() => void>
    api: ApiClient | null
    options?: UseSendMessageOptions
    haptic: ReturnType<typeof usePlatform>['haptic']
    processing: boolean
    resolving: boolean
    paused: boolean
    awaitingTurnCompletion: boolean
    observedThinking: boolean
    turnStartFallbackTimer: ReturnType<typeof setTimeout> | null
    resolvedSessionId: string | null
    pendingSessionResolution: {
        fromSessionId: string
        toSessionId: string
    } | null
}

type BlockedReason = 'no-api' | 'no-session'

type UseSendMessageOptions = {
    thinking?: boolean
    resolveSessionId?: (sessionId: string) => Promise<string>
    onSessionResolved?: (sessionId: string) => void
    onBlocked?: (reason: BlockedReason) => void
}

const EMPTY_SNAPSHOT: QueueSnapshot = {
    queuedMessages: [],
    isProcessing: false,
    isResolving: false,
    isQueuePaused: false,
}

const noopHaptic: ReturnType<typeof usePlatform>['haptic'] = {
    impact: () => {},
    notification: () => {},
    selection: () => {},
}

const queueStores = new Map<string, QueueStore>()

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

function createQueueSnapshot(store: QueueStore, processing = store.processing): QueueSnapshot {
    return {
        queuedMessages: store.queue.map((item, index) => ({
            localId: item.localId,
            text: item.text,
            attachmentsCount: item.attachments?.length ?? 0,
            status: processing && index === 0 ? 'sending' : 'queued'
        })),
        isProcessing: store.processing,
        isResolving: store.resolving,
        isQueuePaused: store.paused && store.queue.length > 0,
    }
}

function notify(store: QueueStore): void {
    for (const listener of store.listeners) {
        listener()
    }
}

function clearTurnStartFallbackTimer(store: QueueStore): void {
    if (store.turnStartFallbackTimer !== null) {
        clearTimeout(store.turnStartFallbackTimer)
        store.turnStartFallbackTimer = null
    }
}

function cleanupQueueStore(key: string): void {
    const store = queueStores.get(key)
    if (!store) {
        return
    }
    if (store.listeners.size > 0) {
        return
    }
    if (store.queue.length > 0 || store.processing || store.resolving || store.awaitingTurnCompletion) {
        return
    }
    clearTurnStartFallbackTimer(store)
    queueStores.delete(key)
}

function syncQueueSnapshot(store: QueueStore, processing = store.processing): void {
    if (store.queue.length === 0 && !store.processing && !store.resolving) {
        store.paused = false
        if (!store.pendingSessionResolution) {
            store.resolvedSessionId = null
        }
    }

    store.snapshot = createQueueSnapshot(store, processing)
    notify(store)
    cleanupQueueStore(store.key)
}

function releaseAwaitingTurnCompletion(store: QueueStore): void {
    clearTurnStartFallbackTimer(store)
    store.awaitingTurnCompletion = false
    store.observedThinking = false
}

function armAwaitingTurnCompletion(store: QueueStore): void {
    clearTurnStartFallbackTimer(store)
    store.awaitingTurnCompletion = true
    store.observedThinking = store.options?.thinking === true

    store.turnStartFallbackTimer = setTimeout(() => {
        if (store.observedThinking) {
            return
        }
        if (store.options?.thinking) {
            store.observedThinking = true
            return
        }

        releaseAwaitingTurnCompletion(store)
        void flushQueue(store)
    }, 800)
}

function enqueueOptimisticMessage(input: SendQueueItem): void {
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
}

function prepareQueuedMessageForSend(input: SendQueueItem): void {
    if (input.optimisticApplied) {
        updateMessageStatus(input.optimisticSessionId, input.localId, 'sending')
        return
    }

    enqueueOptimisticMessage(input)
    input.optimisticApplied = true
}

async function flushQueue(store: QueueStore): Promise<void> {
    if (store.processing || store.awaitingTurnCompletion || store.paused) {
        return
    }

    store.processing = true
    syncQueueSnapshot(store, true)

    try {
        while (store.queue.length > 0) {
            if (store.options?.thinking) {
                break
            }

            const current = store.queue[0]
            const currentApi = store.api

            prepareQueuedMessageForSend(current)

            if (!currentApi) {
                updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                store.haptic.notification('error')
                store.queue.shift()
                syncQueueSnapshot(store, true)
                continue
            }

            let targetSessionId = current.sessionId
            const currentOptions = store.options

            if (currentOptions?.resolveSessionId) {
                store.resolving = true
                syncQueueSnapshot(store, true)

                try {
                    const resolvedSessionId = await currentOptions.resolveSessionId(targetSessionId)
                    if (resolvedSessionId && resolvedSessionId !== targetSessionId) {
                        store.resolvedSessionId = resolvedSessionId
                        store.pendingSessionResolution = {
                            fromSessionId: store.pendingSessionResolution?.fromSessionId ?? current.optimisticSessionId,
                            toSessionId: resolvedSessionId,
                        }
                        for (const queued of store.queue) {
                            if (queued.sessionId === targetSessionId) {
                                queued.sessionId = resolvedSessionId
                            }
                        }
                        targetSessionId = resolvedSessionId
                    }
                } catch (error) {
                    updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                    store.haptic.notification('error')
                    console.error('Failed to resolve session before send:', error)
                    store.queue.shift()
                    syncQueueSnapshot(store, true)
                    continue
                } finally {
                    store.resolving = false
                    syncQueueSnapshot(store, true)
                }
            }

            let sendStarted = false

            try {
                await currentApi.sendMessage(targetSessionId, current.text, current.localId, current.attachments)
                updateMessageStatus(current.optimisticSessionId, current.localId, 'sent')
                store.haptic.notification('success')
                sendStarted = true
            } catch (error) {
                updateMessageStatus(current.optimisticSessionId, current.localId, 'failed')
                store.haptic.notification('error')
                console.error('Failed to send message:', error)
            } finally {
                store.queue.shift()
                syncQueueSnapshot(store, true)
            }

            if (sendStarted) {
                armAwaitingTurnCompletion(store)
                break
            }
        }
    } finally {
        store.processing = false
        syncQueueSnapshot(store, false)

        const pendingSessionResolution = store.pendingSessionResolution
        if (store.queue.length === 0 && pendingSessionResolution) {
            store.pendingSessionResolution = null
            store.resolvedSessionId = null
            store.options?.onSessionResolved?.(pendingSessionResolution.toSessionId)
        }
    }
}

function applyBindings(
    store: QueueStore,
    bindings: {
        api: ApiClient | null
        options?: UseSendMessageOptions
        haptic: ReturnType<typeof usePlatform>['haptic']
    }
): void {
    store.api = bindings.api
    store.options = bindings.options
    store.haptic = bindings.haptic

    const thinking = bindings.options?.thinking === true

    if (thinking) {
        if (store.awaitingTurnCompletion) {
            store.observedThinking = true
            clearTurnStartFallbackTimer(store)
        }
        return
    }

    if (store.paused) {
        if (store.awaitingTurnCompletion && store.observedThinking) {
            releaseAwaitingTurnCompletion(store)
        }
        return
    }

    if (store.awaitingTurnCompletion && store.observedThinking) {
        releaseAwaitingTurnCompletion(store)
        void flushQueue(store)
        return
    }

    if (!store.awaitingTurnCompletion && store.queue.length > 0 && !store.processing) {
        void flushQueue(store)
    }
}

function createQueueStore(key: string): QueueStore {
    return {
        key,
        queue: [],
        snapshot: EMPTY_SNAPSHOT,
        listeners: new Set(),
        api: null,
        options: undefined,
        haptic: noopHaptic,
        processing: false,
        resolving: false,
        paused: false,
        awaitingTurnCompletion: false,
        observedThinking: false,
        turnStartFallbackTimer: null,
        resolvedSessionId: null,
        pendingSessionResolution: null,
    }
}

function getQueueStore(key: string): QueueStore {
    const existing = queueStores.get(key)
    if (existing) {
        return existing
    }

    const created = createQueueStore(key)
    queueStores.set(key, created)
    return created
}

function subscribeQueueStore(key: string, listener: () => void): () => void {
    const store = getQueueStore(key)
    store.listeners.add(listener)

    return () => {
        store.listeners.delete(listener)
        cleanupQueueStore(key)
    }
}

function enqueueMessage(store: QueueStore, input: SendQueueItem): void {
    store.queue.push(input)
    syncQueueSnapshot(store)
    void flushQueue(store)
}

function pauseQueue(store: QueueStore): void {
    if (store.queue.length === 0) {
        return
    }

    clearTurnStartFallbackTimer(store)
    store.paused = true
    syncQueueSnapshot(store)
}

function resumeQueue(store: QueueStore): void {
    if (!store.paused && store.queue.length === 0) {
        return
    }

    store.paused = false
    syncQueueSnapshot(store)

    if (!store.options?.thinking && store.awaitingTurnCompletion) {
        releaseAwaitingTurnCompletion(store)
    }

    void flushQueue(store)
}

function editQueuedMessage(store: QueueStore, localId: string, text: string): void {
    let changed = false

    store.queue = store.queue.map((item, index) => {
        const isSendingItem = store.processing && index === 0
        if (item.localId !== localId || isSendingItem) {
            return item
        }

        if (item.text === text) {
            return item
        }

        changed = true
        return {
            ...item,
            text,
        }
    })

    if (changed) {
        syncQueueSnapshot(store)
    }
}

function deleteQueuedMessage(store: QueueStore, localId: string): void {
    const nextQueue = store.queue.filter((item, index) => {
        const isSendingItem = store.processing && index === 0
        if (isSendingItem) {
            return true
        }
        return item.localId !== localId
    })

    if (nextQueue.length === store.queue.length) {
        return
    }

    store.queue = nextQueue
    syncQueueSnapshot(store)
}

export function clearSendQueue(key: string): void {
    const store = queueStores.get(key)
    if (!store) {
        return
    }

    clearTurnStartFallbackTimer(store)
    queueStores.delete(key)
}

export function useSendMessage(
    api: ApiClient | null,
    sessionId: string | null,
    options?: UseSendMessageOptions
): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    retryMessage: (localId: string) => void
    editQueuedMessage: (localId: string, text: string) => void
    deleteQueuedMessage: (localId: string) => void
    pauseQueue: () => void
    resumeQueue: () => void
    isQueuePaused: boolean
    isSending: boolean
    queuedMessages: QueuedComposerMessage[]
} {
    const { haptic } = usePlatform()

    const snapshot = useSyncExternalStore(
        useCallback((onStoreChange) => {
            if (!sessionId) {
                return () => {}
            }
            return subscribeQueueStore(sessionId, onStoreChange)
        }, [sessionId]),
        useCallback(() => {
            if (!sessionId) {
                return EMPTY_SNAPSHOT
            }
            return getQueueStore(sessionId).snapshot
        }, [sessionId]),
        () => EMPTY_SNAPSHOT
    )

    useEffect(() => {
        if (!sessionId) {
            return
        }

        const store = getQueueStore(sessionId)
        applyBindings(store, { api, options, haptic })

        return () => {
            cleanupQueueStore(sessionId)
        }
    }, [api, haptic, options, sessionId])

    const sendMessage = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
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

        const store = getQueueStore(sessionId)
        const localId = makeClientSideId('local')
        const createdAt = Date.now()

        enqueueMessage(store, {
            sessionId: store.resolvedSessionId ?? sessionId,
            optimisticSessionId: sessionId,
            text,
            localId,
            createdAt,
            attachments,
            optimisticApplied: false,
        })
    }, [api, haptic, options, sessionId])

    const retryMessage = useCallback((localId: string) => {
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
        if (!message) {
            return
        }

        const retryPayload = getRetryPayload(message)
        if (!retryPayload) {
            return
        }

        const store = getQueueStore(sessionId)
        enqueueMessage(store, {
            sessionId: store.resolvedSessionId ?? sessionId,
            optimisticSessionId: sessionId,
            text: retryPayload.text,
            localId,
            createdAt: message.createdAt,
            attachments: retryPayload.attachments,
            optimisticApplied: true,
        })
    }, [api, haptic, options, sessionId])

    const handleEditQueuedMessage = useCallback((localId: string, text: string) => {
        if (!sessionId) {
            return
        }
        editQueuedMessage(getQueueStore(sessionId), localId, text)
    }, [sessionId])

    const handleDeleteQueuedMessage = useCallback((localId: string) => {
        if (!sessionId) {
            return
        }
        deleteQueuedMessage(getQueueStore(sessionId), localId)
    }, [sessionId])

    const handlePauseQueue = useCallback(() => {
        if (!sessionId) {
            return
        }
        pauseQueue(getQueueStore(sessionId))
    }, [sessionId])

    const handleResumeQueue = useCallback(() => {
        if (!sessionId) {
            return
        }
        resumeQueue(getQueueStore(sessionId))
    }, [sessionId])

    return {
        sendMessage,
        retryMessage,
        editQueuedMessage: handleEditQueuedMessage,
        deleteQueuedMessage: handleDeleteQueuedMessage,
        pauseQueue: handlePauseQueue,
        resumeQueue: handleResumeQueue,
        isQueuePaused: snapshot.isQueuePaused,
        isSending: snapshot.isProcessing || snapshot.isResolving || snapshot.queuedMessages.length > 0,
        queuedMessages: snapshot.queuedMessages,
    }
}
