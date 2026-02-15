export type PrependScrollAnchorSnapshot = {
    id: string
    offsetTop: number
}

export type PrependScrollSnapshot = {
    scrollTop: number
    scrollHeight: number
    anchors: PrependScrollAnchorSnapshot[]
}

function getAnchorId(el: HTMLElement, selector: string): string | null {
    const anchorEl = el.closest(selector) as HTMLElement | null
    const id = anchorEl?.dataset.hapiMessageId
    if (!id) {
        return null
    }
    return id
}

function getAnchorFromProbePoint(viewport: HTMLElement, selector: string): PrependScrollAnchorSnapshot | null {
    const rect = viewport.getBoundingClientRect()
    const probeX = rect.left + Math.min(48, rect.width / 2)
    const probeY = rect.top + 16

    const hit = document.elementFromPoint(probeX, probeY) as HTMLElement | null
    if (!hit) {
        return null
    }

    const id = getAnchorId(hit, selector)
    if (!id) {
        return null
    }

    const anchorEl = hit.closest(selector) as HTMLElement
    return {
        id,
        offsetTop: anchorEl.getBoundingClientRect().top - rect.top
    }
}

function getVisibleAnchors(viewport: HTMLElement, selector: string, maxAnchors: number): PrependScrollAnchorSnapshot[] {
    const viewportRect = viewport.getBoundingClientRect()
    const candidates = viewport.querySelectorAll<HTMLElement>(selector)
    const anchors: PrependScrollAnchorSnapshot[] = []

    for (const el of candidates) {
        const id = el.dataset.hapiMessageId
        if (!id) continue

        const rect = el.getBoundingClientRect()
        if (rect.bottom <= viewportRect.top + 1) continue
        if (rect.top >= viewportRect.bottom - 1) continue

        anchors.push({ id, offsetTop: rect.top - viewportRect.top })
    }

    anchors.sort((a, b) => a.offsetTop - b.offsetTop)
    return anchors.slice(0, maxAnchors)
}

export function capturePrependScrollSnapshot(
    viewport: HTMLElement,
    opts?: {
        selector?: string
        maxAnchors?: number
    }
): PrependScrollSnapshot {
    const selector = opts?.selector ?? '[data-hapi-message-id]'
    const maxAnchors = opts?.maxAnchors ?? 12

    const probe = getAnchorFromProbePoint(viewport, selector)
    const visible = getVisibleAnchors(viewport, selector, maxAnchors)

    const anchors: PrependScrollAnchorSnapshot[] = []
    if (probe) {
        anchors.push(probe)
    }
    for (const a of visible) {
        if (!anchors.some((existing) => existing.id === a.id)) {
            anchors.push(a)
        }
    }

    return {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        anchors
    }
}

function buildAnchorMap(viewport: HTMLElement, selector: string): Map<string, HTMLElement> {
    const map = new Map<string, HTMLElement>()
    for (const el of viewport.querySelectorAll<HTMLElement>(selector)) {
        const id = el.dataset.hapiMessageId
        if (!id) continue
        if (!map.has(id)) {
            map.set(id, el)
        }
    }
    return map
}

function applyAnchorAdjustment(
    viewport: HTMLElement,
    anchorMap: Map<string, HTMLElement>,
    snapshot: PrependScrollSnapshot
): PrependScrollAnchorSnapshot | null {
    if (snapshot.anchors.length === 0) {
        return null
    }

    const viewportRect = viewport.getBoundingClientRect()

    for (const anchor of snapshot.anchors) {
        const el = anchorMap.get(anchor.id)
        if (!el) continue

        const nextOffsetTop = el.getBoundingClientRect().top - viewportRect.top
        const diff = nextOffsetTop - anchor.offsetTop
        if (Number.isFinite(diff) && Math.abs(diff) > 0.5) {
            viewport.scrollTop += diff
        }
        return anchor
    }

    return null
}

function applyScrollHeightFallback(viewport: HTMLElement, snapshot: PrependScrollSnapshot): void {
    const delta = viewport.scrollHeight - snapshot.scrollHeight
    viewport.scrollTop = snapshot.scrollTop + delta
}

function stabilizeAnchorOffset(params: {
    viewport: HTMLElement
    observeElement: Element
    selector: string
    anchorId: string
    expectedOffsetTop: number
    maxMs: number
}): () => void {
    const { viewport, observeElement, selector, anchorId, expectedOffsetTop, maxMs } = params

    const ignoreUserScrollUntil = Date.now() + 250
    let resizeObserver: ResizeObserver | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let rafId: number | null = null
    let stopped = false
    let applying = false

    const stop = () => {
        if (stopped) return
        stopped = true
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
        }
        viewport.removeEventListener('scroll', onScroll)
        resizeObserver?.disconnect()
        if (timeoutId !== null) {
            clearTimeout(timeoutId)
        }
    }

    const adjust = () => {
        rafId = null
        if (stopped) return

        const anchorEl = buildAnchorMap(viewport, selector).get(anchorId)
        if (!anchorEl) {
            stop()
            return
        }

        const viewportRect = viewport.getBoundingClientRect()
        const nextOffsetTop = anchorEl.getBoundingClientRect().top - viewportRect.top
        const diff = nextOffsetTop - expectedOffsetTop
        if (Number.isFinite(diff) && Math.abs(diff) > 0.5) {
            applying = true
            viewport.scrollTop += diff
            applying = false
        }
    }

    const scheduleAdjust = () => {
        if (stopped) return
        if (rafId !== null) return
        rafId = requestAnimationFrame(adjust)
    }

    const onScroll = () => {
        if (stopped) return
        if (Date.now() < ignoreUserScrollUntil) return
        if (applying) return
        // User scroll: stop fighting them.
        stop()
    }

    viewport.addEventListener('scroll', onScroll, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
            scheduleAdjust()
        })
        resizeObserver.observe(observeElement)
    } else {
        // Fallback: run a short rAF loop.
        const start = Date.now()
        const tick = () => {
            if (stopped) return
            adjust()
            if (Date.now() - start > maxMs) {
                stop()
                return
            }
            rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
    }

    timeoutId = setTimeout(stop, maxMs)
    scheduleAdjust()

    return stop
}

export function restorePrependScrollSnapshot(
    viewport: HTMLElement,
    snapshot: PrependScrollSnapshot,
    opts?: {
        selector?: string
        observeElement?: Element | null
        stabilizeMs?: number
    }
): { usedAnchor: PrependScrollAnchorSnapshot | null; cleanup: (() => void) | null; didFallback: boolean } {
    const selector = opts?.selector ?? '[data-hapi-message-id]'
    const anchorMap = buildAnchorMap(viewport, selector)

    const usedAnchor = applyAnchorAdjustment(viewport, anchorMap, snapshot)
    const didFallback = usedAnchor === null
    if (didFallback) {
        applyScrollHeightFallback(viewport, snapshot)
        return { usedAnchor: null, cleanup: null, didFallback: true }
    }

    const observeElement = opts?.observeElement ?? viewport
    const stabilizeMs = opts?.stabilizeMs ?? 1200
    if (!observeElement) {
        return { usedAnchor, cleanup: null, didFallback: false }
    }

    const cleanup = stabilizeAnchorOffset({
        viewport,
        observeElement,
        selector,
        anchorId: usedAnchor.id,
        expectedOffsetTop: usedAnchor.offsetTop,
        maxMs: stabilizeMs
    })

    return { usedAnchor, cleanup, didFallback: false }
}
