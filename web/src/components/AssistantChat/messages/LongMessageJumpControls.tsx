import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from '@/lib/use-translation'
import {
    collectLongMessageHeadings,
    findLongMessageStartElement,
    getActiveLongMessageHeadingId,
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
    const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
    const [tocOpen, setTocOpen] = useState(false)
    const controlsRef = useRef<HTMLDivElement | null>(null)
    const tocItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

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

    const refreshActiveHeading = useCallback(() => {
        if (!navigation.visible || navigation.headings.length === 0) {
            setActiveHeadingId(null)
            return
        }

        const messageEl = messageRef.current
        const doc = contentRef.current?.ownerDocument
        const scrollContainer = findScrollContainer(messageEl)
        if (!messageEl || !doc || !scrollContainer) {
            setActiveHeadingId(null)
            return
        }

        const activationTop = scrollContainer.getBoundingClientRect().top + 96
        const headingPositions = navigation.headings
            .map((heading) => {
                const element = doc.getElementById(heading.id)
                if (!element) return null

                return {
                    id: heading.id,
                    top: element.getBoundingClientRect().top
                }
            })
            .filter((heading): heading is { id: string; top: number } => Boolean(heading))

        const nextActiveId = getActiveLongMessageHeadingId(headingPositions, activationTop)
        setActiveHeadingId((current) => current === nextActiveId ? current : nextActiveId)
    }, [contentRef, messageRef, navigation.headings, navigation.visible])

    useEffect(() => {
        if (!navigation.visible || navigation.headings.length === 0) {
            setActiveHeadingId(null)
            return
        }

        const scrollContainer = findScrollContainer(messageRef.current)
        if (!scrollContainer) {
            setActiveHeadingId(null)
            return
        }

        let frame = 0

        const scheduleRefresh = () => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(refreshActiveHeading)
        }

        scheduleRefresh()
        scrollContainer.addEventListener('scroll', scheduleRefresh, { passive: true })
        window.addEventListener('resize', scheduleRefresh)

        return () => {
            scrollContainer.removeEventListener('scroll', scheduleRefresh)
            window.removeEventListener('resize', scheduleRefresh)
            window.cancelAnimationFrame(frame)
        }
    }, [messageRef, navigation.headings, navigation.visible, refreshActiveHeading])

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

    useEffect(() => {
        if (!tocOpen || !activeHeadingId) return

        const activeItem = tocItemRefs.current.get(activeHeadingId)
        activeItem?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }, [activeHeadingId, tocOpen])

    const stopPropagation = useCallback((event: { stopPropagation: () => void }) => {
        event.stopPropagation()
    }, [])

    const registerTocItem = useCallback((id: string, element: HTMLButtonElement | null) => {
        if (element) {
            tocItemRefs.current.set(id, element)
            return
        }

        tocItemRefs.current.delete(id)
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
        const startElement = contentRef.current ? findLongMessageStartElement(contentRef.current) : null
        scrollToElement(startElement ?? messageRef.current, 'start')
        setTocOpen(false)
    }, [contentRef, messageRef, scrollToElement])

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
    const tocButtonClassName = activeHeadingId
        ? `${buttonClassName} border-[var(--app-link)] text-[var(--app-link)]`
        : buttonClassName

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
                            className={tocButtonClassName}
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
                                        ref={(element) => registerTocItem(heading.id, element)}
                                        type="button"
                                        aria-current={activeHeadingId === heading.id ? 'location' : undefined}
                                        className={
                                            activeHeadingId === heading.id
                                                ? 'block w-full truncate rounded-md bg-[var(--app-subtle-bg)] px-3 py-2 text-left text-sm font-medium text-[var(--app-link)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'
                                                : 'block w-full truncate rounded-md px-3 py-2 text-left text-sm text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'
                                        }
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
