import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import {
    capturePrependScrollSnapshot,
    restorePrependScrollSnapshot,
    type PrependScrollSnapshot
} from '@/lib/prepend-scroll-retention'

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
    assistantBubbleEnabled: boolean
}) {
    const { t } = useTranslation()
    const { isTouch } = usePlatform()
    const touchCapable = isTouch || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0)
    const NEAR_BOTTOM_THRESHOLD_PX = 120
    const NEAR_TOP_THRESHOLD_PX = 120
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const contentRef = useRef<HTMLDivElement | null>(null)
    const topSentinelRef = useRef<HTMLDivElement | null>(null)
    const wasNearTopRef = useRef(false)
    const wasTopSentinelIntersectingRef = useRef(false)
    const lastScrollTopRef = useRef(0)
    const suppressTopLoadUntilRef = useRef(0)
    const loadLockRef = useRef(false)
    const pendingScrollRef = useRef<PrependScrollSnapshot | null>(null)
    const scrollStabilizerCleanupRef = useRef<(() => void) | null>(null)
    const scrollObserverRef = useRef<MutationObserver | null>(null)
    const scrollObserverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

            // Detect intentional upward scrolling by the user (not auto-scroll jitter).
            // When new content is appended, scrollHeight increases before auto-scroll
            // updates scrollTop, creating a brief gap where distanceFromBottom exceeds
            // the threshold.  We must not treat that gap as "user scrolled away" because
            // it would route incoming SSE messages to the pending buffer instead of
            // showing them immediately.
            const userScrolledUp = prevScrollTop - viewport.scrollTop > 3

            if (isNearBottom) {
                if (!autoScrollEnabledRef.current) setAutoScrollEnabled(true)
            } else if (autoScrollEnabledRef.current && userScrolledUp) {
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
                if (!isNearBottom && atBottomRef.current && !userScrolledUp) {
                    // Auto-scroll gap: scrollHeight grew but scrollTop hasn't caught up.
                    // Keep atBottom=true so incoming messages go straight to the visible
                    // list instead of being buffered in pending.
                } else {
                    atBottomRef.current = isNearBottom
                    onAtBottomChangeRef.current(isNearBottom)
                    if (isNearBottom) {
                        onFlushPendingRef.current()
                    }
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

    // Shared scroll restoration logic used by both useLayoutEffect and MutationObserver.
    const runScrollRestoration = useCallback(() => {
        const pending = pendingScrollRef.current
        const viewport = viewportRef.current
        if (!pending || !viewport) return false

        scrollObserverRef.current?.disconnect()
        scrollObserverRef.current = null
        if (scrollObserverTimeoutRef.current !== null) {
            clearTimeout(scrollObserverTimeoutRef.current)
            scrollObserverTimeoutRef.current = null
        }

        scrollStabilizerCleanupRef.current?.()
        const restored = restorePrependScrollSnapshot(viewport, pending, {
            selector: '[data-hapi-message-id]',
            observeElement: contentRef.current,
            stabilizeMs: 1600,
        })
        scrollStabilizerCleanupRef.current = restored.cleanup

        pendingScrollRef.current = null
        loadLockRef.current = false
        suppressTopLoadUntilRef.current = Date.now() + 250
        return true
    }, [])

    const handleLoadMore = useCallback(() => {
        if (isLoadingMessagesRef.current || !hasMoreMessagesRef.current || isLoadingMoreRef.current || loadLockRef.current) {
            return
        }
        const viewport = viewportRef.current
        if (!viewport) {
            return
        }
        scrollStabilizerCleanupRef.current?.()
        scrollStabilizerCleanupRef.current = null
        scrollObserverRef.current?.disconnect()
        scrollObserverRef.current = null
        if (scrollObserverTimeoutRef.current !== null) {
            clearTimeout(scrollObserverTimeoutRef.current)
            scrollObserverTimeoutRef.current = null
        }

        pendingScrollRef.current = capturePrependScrollSnapshot(viewport, { selector: '[data-hapi-message-id]', maxAnchors: 16 })

        // Set up a MutationObserver to detect when the DOM actually updates with
        // prepended messages.  @assistant-ui/react updates its runtime via useEffect
        // (not useLayoutEffect), so the DOM change happens in a later render cycle
        // — after our useLayoutEffect has already fired.  The observer catches that
        // second commit and runs scroll restoration before the browser paints.
        const content = contentRef.current
        if (content) {
            const snapshotScrollHeight = viewport.scrollHeight
            const observer = new MutationObserver(() => {
                const vp = viewportRef.current
                if (!pendingScrollRef.current || !vp) {
                    observer.disconnect()
                    scrollObserverRef.current = null
                    return
                }
                // Only restore once new content has actually been added to the DOM.
                if (vp.scrollHeight <= snapshotScrollHeight + 2) return
                runScrollRestoration()
            })
            observer.observe(content, { childList: true, subtree: true })
            scrollObserverRef.current = observer

            // Safety: clean up if nothing happens within 5 seconds.
            scrollObserverTimeoutRef.current = setTimeout(() => {
                observer.disconnect()
                scrollObserverRef.current = null
                scrollObserverTimeoutRef.current = null
                if (pendingScrollRef.current) {
                    pendingScrollRef.current = null
                    loadLockRef.current = false
                }
            }, 5000)
        }

        loadLockRef.current = true
        loadStartedRef.current = false
        let loadPromise: Promise<unknown>
        try {
            loadPromise = onLoadMoreRef.current()
        } catch (error) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            scrollObserverRef.current?.disconnect()
            scrollObserverRef.current = null
            throw error
        }
        void loadPromise.catch((error) => {
            pendingScrollRef.current = null
            loadLockRef.current = false
            scrollObserverRef.current?.disconnect()
            scrollObserverRef.current = null
            console.error('Failed to load older messages:', error)
        }).finally(() => {
            if (!loadStartedRef.current && !isLoadingMoreRef.current && pendingScrollRef.current) {
                pendingScrollRef.current = null
                loadLockRef.current = false
                scrollObserverRef.current?.disconnect()
                scrollObserverRef.current = null
            }
        })
    }, [])

    useEffect(() => {
        handleLoadMoreRef.current = handleLoadMore
    }, [handleLoadMore])

    useEffect(() => {
        return () => {
            scrollStabilizerCleanupRef.current?.()
            scrollObserverRef.current?.disconnect()
            if (scrollObserverTimeoutRef.current !== null) {
                clearTimeout(scrollObserverTimeoutRef.current)
            }
        }
    }, [])

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

        // @assistant-ui/react updates its internal runtime via useEffect (after
        // useLayoutEffect), so the DOM may still show the old messages at this
        // point.  Only run restoration if the DOM has actually changed; otherwise
        // the MutationObserver set up in handleLoadMore will handle it once the
        // runtime commits the new messages.
        if (viewport.scrollHeight <= pending.scrollHeight + 2) {
            return
        }

        runScrollRestoration()
    }, [props.messagesVersion, runScrollRestoration])

    useEffect(() => {
        isLoadingMoreRef.current = props.isLoadingMoreMessages
        if (props.isLoadingMoreMessages) {
            loadStartedRef.current = true
        }
        if (prevLoadingMoreRef.current && !props.isLoadingMoreMessages && pendingScrollRef.current) {
            pendingScrollRef.current = null
            loadLockRef.current = false
            scrollObserverRef.current?.disconnect()
            scrollObserverRef.current = null
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
            onRetryMessage: props.onRetryMessage,
            assistantBubbleEnabled: props.assistantBubbleEnabled
        }}>
            <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col relative">
                <ThreadPrimitive.Viewport asChild autoScroll={autoScrollEnabled}>
                    <div
                        ref={viewportRef}
                        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                        style={(
                            touchCapable
                                ? { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', overflowAnchor: 'none' }
                                : { overflowAnchor: 'none' }
                        ) as unknown as CSSProperties}
                    >
                        <div ref={contentRef} className="relative mx-auto w-full max-w-content min-w-0 p-3">
                            <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
                            {props.isLoadingMoreMessages ? (
                                <div className="pointer-events-none absolute top-2 left-0 right-0 flex items-center justify-center gap-2 text-xs text-[var(--app-hint)]">
                                    <Spinner size="sm" label={null} className="text-current" />
                                    {t('misc.loading')}
                                </div>
                            ) : null}
                            {showSkeleton ? (
                                <MessageSkeleton />
                            ) : (
                                <>
                                    {props.messagesWarning ? (
                                        <div className="mb-3 rounded-md bg-amber-500/10 p-2 text-xs">
                                            {props.messagesWarning}
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
