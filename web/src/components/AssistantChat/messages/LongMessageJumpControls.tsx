import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from '@/lib/use-translation'
import {
    collectLongMessageHeadings,
    normalizeLongMessageHeadingSegment,
    shouldShowLongMessageJumpControls,
    type LongMessageHeading,
} from '@/components/AssistantChat/messages/long-message-navigation'

type LongMessageJumpControlsProps = {
    bottomRef: RefObject<HTMLElement | null>
    candidate: boolean
    contentRef: RefObject<HTMLElement | null>
    messageId: string
    messageRef: RefObject<HTMLElement | null>
}

type NavigationState = {
    headings: LongMessageHeading[]
    visible: boolean
}

function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
    let current = element?.parentElement ?? null

    while (current) {
        const style = window.getComputedStyle(current)
        if (/auto|scroll|overlay/.test(style.overflowY)) {
            return current
        }
        current = current.parentElement
    }

    return null
}

function sameHeadings(a: LongMessageHeading[], b: LongMessageHeading[]): boolean {
    if (a.length !== b.length) return false

    return a.every((item, index) => {
        const next = b[index]
        return next && item.id === next.id && item.label === next.label && item.level === next.level
    })
}

export function LongMessageJumpControls(props: LongMessageJumpControlsProps) {
    const { t } = useTranslation()
    const { bottomRef, candidate, contentRef, messageId, messageRef } = props
    const [navigation, setNavigation] = useState<NavigationState>({ headings: [], visible: false })
    const [tocOpen, setTocOpen] = useState(false)
    const controlsRef = useRef<HTMLDivElement | null>(null)

    const headingIdPrefix = useMemo(
        () => `hapi-message-${normalizeLongMessageHeadingSegment(messageId)}`,
        [messageId]
    )

    const refreshNavigation = useCallback(() => {
        const messageEl = messageRef.current
        const contentEl = contentRef.current
        if (!messageEl || !contentEl) return

        const scrollContainer = findScrollContainer(messageEl)
        const viewportHeight = scrollContainer?.clientHeight || window.innerHeight
        const visible = shouldShowLongMessageJumpControls(messageEl.getBoundingClientRect().height, viewportHeight)
        const headings = visible ? collectLongMessageHeadings(contentEl, headingIdPrefix) : []

        setNavigation((current) => {
            if (current.visible === visible && sameHeadings(current.headings, headings)) {
                return current
            }

            return { headings, visible }
        })
    }, [contentRef, headingIdPrefix, messageRef])

    useEffect(() => {
        if (!candidate) {
            setNavigation((current) => current.visible || current.headings.length > 0 ? { headings: [], visible: false } : current)
            setTocOpen(false)
            return
        }

        refreshNavigation()

        const contentEl = contentRef.current
        const messageEl = messageRef.current
        let frame = 0
        let resizeObserver: ResizeObserver | null = null
        let mutationObserver: MutationObserver | null = null

        const scheduleRefresh = () => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(refreshNavigation)
        }

        window.addEventListener('resize', scheduleRefresh)

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleRefresh)
            if (messageEl) resizeObserver.observe(messageEl)
            if (contentEl && contentEl !== messageEl) resizeObserver.observe(contentEl)
        }

        if (typeof MutationObserver !== 'undefined' && contentEl) {
            mutationObserver = new MutationObserver(scheduleRefresh)
            mutationObserver.observe(contentEl, {
                characterData: true,
                childList: true,
                subtree: true,
            })
        }

        return () => {
            window.removeEventListener('resize', scheduleRefresh)
            window.cancelAnimationFrame(frame)
            resizeObserver?.disconnect()
            mutationObserver?.disconnect()
        }
    }, [candidate, contentRef, messageRef, refreshNavigation])

    useEffect(() => {
        if (navigation.visible) return
        setTocOpen(false)
    }, [navigation.visible])

    useEffect(() => {
        if (!tocOpen) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (target && controlsRef.current?.contains(target)) {
                return
            }
            setTocOpen(false)
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setTocOpen(false)
            }
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [tocOpen])

    const stopPropagation = useCallback((event: { stopPropagation: () => void }) => {
        event.stopPropagation()
    }, [])

    const scrollToElement = useCallback((element: HTMLElement | null, block: ScrollLogicalPosition) => {
        if (!element) return
        element.scrollIntoView({
            behavior: 'smooth',
            block,
            inline: 'nearest'
        })
    }, [])

    const handleScrollToStart = useCallback(() => {
        scrollToElement(messageRef.current, 'start')
        setTocOpen(false)
    }, [messageRef, scrollToElement])

    const handleScrollToEnd = useCallback(() => {
        scrollToElement(bottomRef.current, 'end')
        setTocOpen(false)
    }, [bottomRef, scrollToElement])

    const handleScrollToHeading = useCallback((id: string) => {
        const doc = contentRef.current?.ownerDocument
        const element = doc?.getElementById(id) ?? null
        scrollToElement(element, 'start')
        setTocOpen(false)
    }, [contentRef, scrollToElement])

    if (!candidate || !navigation.visible) {
        return null
    }

    const buttonClassName = 'rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]/90 px-2 py-1 text-[11px] font-medium text-[var(--app-fg)] shadow-sm backdrop-blur transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'

    return (
        <>
            <div className="pointer-events-none sticky top-2 z-10 mb-2 flex justify-end">
                <div
                    ref={controlsRef}
                    className="pointer-events-auto relative flex items-center gap-1"
                    onContextMenu={stopPropagation}
                    onMouseDown={stopPropagation}
                    onTouchStart={stopPropagation}
                >
                    <button
                        type="button"
                        className={buttonClassName}
                        onClick={handleScrollToStart}
                        title={t('message.jump.start')}
                    >
                        {t('message.jump.start')}
                    </button>
                    <button
                        type="button"
                        className={buttonClassName}
                        onClick={handleScrollToEnd}
                        title={t('message.jump.end')}
                    >
                        {t('message.jump.end')}
                    </button>
                    {navigation.headings.length > 0 ? (
                        <button
                            type="button"
                            className={buttonClassName}
                            aria-expanded={tocOpen}
                            onClick={() => setTocOpen((open) => !open)}
                            title={t('message.jump.toc')}
                        >
                            {t('message.jump.toc')}
                        </button>
                    ) : null}

                    {tocOpen && navigation.headings.length > 0 ? (
                        <div className="absolute right-0 top-full mt-2 w-[min(18rem,80vw)] overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg">
                            <div className="max-h-64 overflow-y-auto p-1">
                                {navigation.headings.map((heading) => (
                                    <button
                                        key={heading.id}
                                        type="button"
                                        className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                                        onClick={() => handleScrollToHeading(heading.id)}
                                        style={{ paddingLeft: `${0.75 + Math.max(0, heading.level - 2) * 0.875}rem` }}
                                        title={heading.label}
                                    >
                                        {heading.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    )
}
