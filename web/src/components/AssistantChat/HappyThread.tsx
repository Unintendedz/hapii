import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import { HappyChatProvider } from '@/components/AssistantChat/context'
import { HappyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { HappyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { HappySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'
import { usePlatform } from '@/hooks/usePlatform'

function NewMessagesIndicator(props: { count: number; onClick: () => void }) {
    const { t } = useTranslation()
    if (props.count === 0) {
        return null
    }

    return (
        <button
            onClick={props.onClick}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--app-button)] text-[var(--app-button-text)] px-3 py-1.5 rounded-full text-sm font-medium shadow-lg animate-bounce-in z-10"
        >
            {t('misc.newMessage', { n: props.count })} &#8595;
        </button>
    )
}

function MessageSkeleton() {
    const { t } = useTranslation()
    const rows = [
        { align: 'end', width: 'w-2/3', height: 'h-10' },
        { align: 'start', width: 'w-3/4', height: 'h-12' },
        { align: 'end', width: 'w-1/2', height: 'h-9' },
        { align: 'start', width: 'w-5/6', height: 'h-14' }
    ]

    return (
        <div role="status" aria-live="polite">
            <span className="sr-only">{t('misc.loadingMessages')}</span>
            <div className="space-y-3 animate-pulse">
                {rows.map((row, index) => (
                    <div key={`skeleton-${index}`} className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`${row.height} ${row.width} rounded-xl bg-[var(--app-subtle-bg)]`} />
                    </div>
                ))}
            </div>
        </div>
    )
}

const THREAD_MESSAGE_COMPONENTS = {
    UserMessage: HappyUserMessage,
    AssistantMessage: HappyAssistantMessage,
    SystemMessage: HappySystemMessage
} as const

type PrependScrollSnapshot = {
    scrollTop: number
    scrollHeight: number
    anchorId: string | null
    anchorOffsetTop: number
}

function escapeAttrValue(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value)
    }
    return value.replace(/"/g, '\\"')
}

function getOffsetTopToRoot(el: HTMLElement): number {
    let top = 0
    let node: HTMLElement | null = el
    while (node) {
        top += node.offsetTop
        node = node.offsetParent as HTMLElement | null
    }
    return top
}

function getOffsetTopRelativeToViewport(el: HTMLElement, viewport: HTMLElement): number {
    return getOffsetTopToRoot(el) - getOffsetTopToRoot(viewport)
}

function getTopVisibleMessageAnchor(viewport: HTMLElement): { id: string; offsetTop: number } | null {
    const candidates = viewport.querySelectorAll<HTMLElement>('[data-hapi-message-id]')
    const scrollTop = viewport.scrollTop
    const viewportBottom = scrollTop + viewport.clientHeight

    let best: { id: string; top: number } | null = null
    for (const el of candidates) {
        const id = el.dataset.hapiMessageId
        if (!id) continue

        const top = getOffsetTopRelativeToViewport(el, viewport)
        const bottom = top + el.offsetHeight
        if (bottom <= scrollTop + 1) continue
        if (top >= viewportBottom - 1) continue

        if (!best || top < best.top) {
            best = { id, top }
        }
    }

    if (!best) return null
    return { id: best.id, offsetTop: best.top - scrollTop }
}

export function HappyThread(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void | Promise<void>
    onAtBottomChange: (atBottom: boolean) => void
    isLoadingMessages: boolean
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => Promise<unknown>
    pendingCount: number
    rawMessagesCount: number
    normalizedMessagesCount: number
    messagesVersion: number
    forceScrollToken: number
}) {
    const { t } = useTranslation()
    const { isTouch } = usePlatform()
    const touchCapable = isTouch || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0)
    const NEAR_BOTTOM_THRESHOLD_PX = 120
    const NEAR_TOP_THRESHOLD_PX = 120
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const topSentinelRef = useRef<HTMLDivElement | null>(null)
    const wasNearTopRef = useRef(false)
    const wasTopSentinelIntersectingRef = useRef(false)
    const lastScrollTopRef = useRef(0)
    const suppressTopLoadUntilRef = useRef(0)
    const loadLockRef = useRef(false)
    const pendingScrollRef = useRef<PrependScrollSnapshot | null>(null)
    const prevLoadingMoreRef = useRef(false)
    const loadStartedRef = useRef(false)
    const isLoadingMoreRef = useRef(props.isLoadingMoreMessages)
    const hasMoreMessagesRef = useRef(props.hasMoreMessages)
    const isLoadingMessagesRef = useRef(props.isLoadingMessages)
    const onLoadMoreRef = useRef(props.onLoadMore)
    const handleLoadMoreRef = useRef<() => void>(() => {})
    const atBottomRef = useRef(true)
    const onAtBottomChangeRef = useRef(props.onAtBottomChange)
    const onFlushPendingRef = useRef(props.onFlushPending)
    const forceScrollTokenRef = useRef(props.forceScrollToken)

    // Smart scroll state: autoScroll enabled when user is near bottom
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
    const autoScrollEnabledRef = useRef(autoScrollEnabled)

    // Keep refs in sync with state
    useEffect(() => {
        autoScrollEnabledRef.current = autoScrollEnabled
    }, [autoScrollEnabled])
    useEffect(() => {
        onAtBottomChangeRef.current = props.onAtBottomChange
    }, [props.onAtBottomChange])
    useEffect(() => {
        onFlushPendingRef.current = props.onFlushPending
    }, [props.onFlushPending])
    useEffect(() => {
        hasMoreMessagesRef.current = props.hasMoreMessages
    }, [props.hasMoreMessages])
    useEffect(() => {
        isLoadingMessagesRef.current = props.isLoadingMessages
    }, [props.isLoadingMessages])
    useEffect(() => {
        onLoadMoreRef.current = props.onLoadMore
    }, [props.onLoadMore])

    // Track scroll position to toggle autoScroll (stable listener using refs)
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const handleScroll = () => {
            const prevScrollTop = lastScrollTopRef.current
            const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
            const isNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
            const now = Date.now()
            const suppressTopLoad = now < suppressTopLoadUntilRef.current

            if (isNearBottom) {
                if (!autoScrollEnabledRef.current) setAutoScrollEnabled(true)
            } else if (autoScrollEnabledRef.current) {
                setAutoScrollEnabled(false)
            }

            // Load older messages only when the user *enters* the near-top region.
            // Avoid "level-triggered" loops where staying at the top keeps loading forever.
            const isNearTop = viewport.scrollTop < NEAR_TOP_THRESHOLD_PX
            const reachedTop = viewport.scrollTop <= 0 && prevScrollTop > 0
            if (isNearTop && !wasNearTopRef.current) {
                wasNearTopRef.current = true
                if (!suppressTopLoad) {
                    handleLoadMoreRef.current()
                }
            } else if (!isNearTop && wasNearTopRef.current) {
                wasNearTopRef.current = false
            } else if (reachedTop) {
                // Allow repeated "scroll to top" loads without requiring the user to scroll
                // down past the near-top threshold in between.
                if (!suppressTopLoad) {
                    handleLoadMoreRef.current()
                }
            }

            lastScrollTopRef.current = viewport.scrollTop

            if (isNearBottom !== atBottomRef.current) {
                atBottomRef.current = isNearBottom
                onAtBottomChangeRef.current(isNearBottom)
                if (isNearBottom) {
                    onFlushPendingRef.current()
                }
            }
        }

        viewport.addEventListener('scroll', handleScroll, { passive: true })
        return () => viewport.removeEventListener('scroll', handleScroll)
    }, []) // Stable: no dependencies, reads from refs

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const touchStartYRef = { current: null as number | null }
        const pullTriggeredRef = { current: false }
        const lastWheelTriggerAtRef = { current: 0 }

        const resetPullState = () => {
            touchStartYRef.current = null
            pullTriggeredRef.current = false
        }

        const handleWheel = (event: WheelEvent) => {
            if (viewport.scrollTop > 0) return
            if (event.deltaY >= 0) return
            const now = Date.now()
            if (now - lastWheelTriggerAtRef.current < 600) {
                return
            }
            lastWheelTriggerAtRef.current = now
            handleLoadMoreRef.current()
        }

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) return
            touchStartYRef.current = event.touches[0]?.clientY ?? null
            pullTriggeredRef.current = false
        }

        const handleTouchMove = (event: TouchEvent) => {
            if (pullTriggeredRef.current) return
            const startY = touchStartYRef.current
            if (startY === null) return
            if (viewport.scrollTop > 0) return
            const currentY = event.touches[0]?.clientY
            if (typeof currentY !== 'number') return

            // At scrollTop=0, dragging downward (positive delta) means "pulling past the top".
            // Trigger one load per gesture.
            const delta = currentY - startY
            if (delta < 28) return
            pullTriggeredRef.current = true
            handleLoadMoreRef.current()
        }

        viewport.addEventListener('wheel', handleWheel, { passive: true })
        viewport.addEventListener('touchstart', handleTouchStart, { passive: true })
        viewport.addEventListener('touchmove', handleTouchMove, { passive: true })
        viewport.addEventListener('touchend', resetPullState, { passive: true })
        viewport.addEventListener('touchcancel', resetPullState, { passive: true })

        return () => {
            viewport.removeEventListener('wheel', handleWheel)
            viewport.removeEventListener('touchstart', handleTouchStart)
            viewport.removeEventListener('touchmove', handleTouchMove)
            viewport.removeEventListener('touchend', resetPullState)
            viewport.removeEventListener('touchcancel', resetPullState)
        }
    }, [])

    // Scroll to bottom handler for the indicator button
    const scrollToBottom = useCallback(() => {
        setAutoScrollEnabled(true)

        // Mark atBottom first so pending flush/refresh treats the user as "returning to bottom".
        // This ensures overflow refresh merges into visible messages instead of remaining pending.
        if (!atBottomRef.current) {
            atBottomRef.current = true
            onAtBottomChangeRef.current(true)
        }

        // Flush pending first so the scroll target includes newly materialized messages.
        const flushResult = onFlushPendingRef.current()

        const doScroll = (behavior: ScrollBehavior) => {
            const viewport = viewportRef.current
            if (!viewport) return
            viewport.scrollTo({ top: viewport.scrollHeight, behavior })
        }

        // Wait for React to render flushed messages before scrolling.
        requestAnimationFrame(() => {
            doScroll('smooth')
            // Snap again in case layout (markdown, code blocks, images) shifts height after the smooth scroll starts.
            requestAnimationFrame(() => doScroll('auto'))
            setTimeout(() => doScroll('auto'), 250)
        })

        // If flush triggers an async refresh, snap again once it finishes.
        void Promise.resolve(flushResult).finally(() => {
            requestAnimationFrame(() => doScroll('auto'))
        })
    }, [])

    // Reset state when session changes
    useEffect(() => {
        setAutoScrollEnabled(true)
        atBottomRef.current = true
        onAtBottomChangeRef.current(true)
        forceScrollTokenRef.current = props.forceScrollToken
    }, [props.sessionId])

    useEffect(() => {
        if (forceScrollTokenRef.current === props.forceScrollToken) {
            return
        }
        forceScrollTokenRef.current = props.forceScrollToken
        scrollToBottom()
    }, [props.forceScrollToken, scrollToBottom])

    const handleLoadMore = useCallback(() => {
        if (isLoadingMessagesRef.current || !hasMoreMessagesRef.current || isLoadingMoreRef.current || loadLockRef.current) {
            return
        }
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }
        const anchor = getTopVisibleMessageAnchor(viewport)
        pendingScrollRef.current = {
            scrollTop: viewport.scrollTop,
            scrollHeight: viewport.scrollHeight,
            anchorId: anchor?.id ?? null,
            anchorOffsetTop: anchor?.offsetTop ?? 0
        }
        loadLockRef.current = true
        loadStartedRef.current = false
        let loadPromise: Promise<unknown>
        try {
            loadPromise = onLoadMoreRef.current()
        } catch (error) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            throw error
        }
        void loadPromise.catch((error) => {
            pendingScrollRef.current = null
            loadLockRef.current = false
            console.error('Failed to load older messages:', error)
        }).finally(() => {
            if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                pendingScrollRef.current = null
                loadLockRef.current = false
            }
        })
    }, [])

    useEffect(() => {
        handleLoadMoreRef.current = handleLoadMore
    }, [handleLoadMore])

    useEffect(() => {
        const sentinel = topSentinelRef.current
        const viewport = viewportRef.current
        if (!sentinel || !viewport || !props.hasMoreMessages || props.isLoadingMessages) {
            return
        }
        if (typeof IntersectionObserver === 'undefined') {
            return
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const now = Date.now()
                const suppressTopLoad = now < suppressTopLoadUntilRef.current
                for (const entry of entries) {
                    // Same idea as the scroll handler: trigger only on the transition
                    // from "not intersecting" -> "intersecting", so we don't keep
                    // loading pages just because the layout changes while staying at the top.
                    if (entry.isIntersecting) {
                        if (!wasTopSentinelIntersectingRef.current) {
                            wasTopSentinelIntersectingRef.current = true
                            if (!suppressTopLoad) {
                                handleLoadMoreRef.current()
                            }
                        }
                    } else if (wasTopSentinelIntersectingRef.current) {
                        wasTopSentinelIntersectingRef.current = false
                    }
                }
            },
            {
                root: viewport,
                rootMargin: '200px 0px 0px 0px'
            }
        )

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [props.hasMoreMessages, props.isLoadingMessages])

    useLayoutEffect(() => {
        const pending = pendingScrollRef.current
        const viewport = viewportRef.current
        if (!pending || !viewport) {
            return
        }

        const applyAnchorAdjustment = () => {
            if (!pending.anchorId) {
                return false
            }
            const selector = `[data-hapi-message-id="${escapeAttrValue(pending.anchorId)}"]`
            const anchorEl = viewport.querySelector<HTMLElement>(selector)
            if (!anchorEl) {
                return false
            }

            const nextTop = getOffsetTopRelativeToViewport(anchorEl, viewport)
            const desiredScrollTop = Math.max(0, nextTop - pending.anchorOffsetTop)
            if (!Number.isFinite(desiredScrollTop)) {
                return false
            }

            if (Math.abs(viewport.scrollTop - desiredScrollTop) > 0.5) {
                viewport.scrollTop = desiredScrollTop
            }
            return true
        }

        const didAnchorAdjust = applyAnchorAdjustment()
        if (!didAnchorAdjust) {
            const delta = viewport.scrollHeight - pending.scrollHeight
            viewport.scrollTop = pending.scrollTop + delta
        }

        // Reconcile again after layout settles (markdown/images may change height after first paint).
        if (pending.anchorId) {
            requestAnimationFrame(() => {
                applyAnchorAdjustment()
            })
            setTimeout(() => {
                applyAnchorAdjustment()
            }, 250)
        }

        pendingScrollRef.current = null
        loadLockRef.current = false
        suppressTopLoadUntilRef.current = Date.now() + 250
    }, [props.messagesVersion])

    useEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (props.isLoadingMoreMessages) {
            loadStartedRef.current = true
        }
        if (prevLoadingMoreRef.current && !props.isLoadingMoreMessages && pendingScrollRef.current) {
            pendingScrollRef.current = null
            loadLockRef.current = false
        }
        prevLoadingMoreRef.current = props.isLoadingMoreMessages
    }, [props.isLoadingMoreMessages])

    const showSkeleton = props.isLoadingMessages && props.rawMessagesCount === 0 && props.pendingCount === 0

    return (
        <HappyChatProvider value={{
            api: props.api,
            sessionId: props.sessionId,
            metadata: props.metadata,
            disabled: props.disabled,
            onRefresh: props.onRefresh,
            onRetryMessage: props.onRetryMessage
        }}>
            <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col relative">
                <ThreadPrimitive.Viewport asChild autoScroll={autoScrollEnabled}>
                    <div
                        ref={viewportRef}
                        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                        style={touchCapable ? { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } : undefined}
                    >
                        <div className="mx-auto w-full max-w-content min-w-0 p-3">
                            <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
                            {showSkeleton ? (
                                <MessageSkeleton />
                            ) : (
                                <>
                                    {props.messagesWarning ? (
                                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs">
                                            {props.messagesWarning}
                                        </div>
                                    ) : null}

                                    {props.isLoadingMoreMessages ? (
                                        <div className="mb-2 flex items-center justify-center gap-2 text-xs text-[var(--app-hint)]">
                                            <Spinner size="sm" label={null} className="text-current" />
                                            {t('misc.loading')}
                                        </div>
                                    ) : null}

                                    {import.meta.env.DEV && props.normalizedMessagesCount === 0 && props.rawMessagesCount > 0 ? (
                                        <div className="mb-2 rounded-md bg-amber-500/10 p-2 text-xs">
                                            Message normalization returned 0 items for {props.rawMessagesCount} messages (see `web/src/chat/normalize.ts`).
                                        </div>
                                    ) : null}
                                </>
                            )}
                            <div className="flex flex-col gap-3">
                                <ThreadPrimitive.Messages components={THREAD_MESSAGE_COMPONENTS} />
                            </div>
                        </div>
                    </div>
                </ThreadPrimitive.Viewport>
                <NewMessagesIndicator count={props.pendingCount} onClick={scrollToBottom} />
            </ThreadPrimitive.Root>
        </HappyChatProvider>
    )
}
