export type PrependScrollAnchorSnapshot = {
    id: string
    offsetTop: number
}

export type PrependScrollSnapshot = {
    scrollTop: number
    scrollHeight: number
    anchors: PrependScrollAnchorSnapshot[]
}

// ---------------------------------------------------------------------------
// Capture – run BEFORE the prepend mutation
// ---------------------------------------------------------------------------

function probeAnchorAtPoint(viewport: HTMLElement, selector: string): PrependScrollAnchorSnapshot | null {
    const rect = viewport.getBoundingClientRect()
    const probeX = rect.left + Math.min(48, rect.width / 2)
    const probeY = rect.top + 16

    const hit = document.elementFromPoint(probeX, probeY) as HTMLElement | null
    if (!hit) return null

    const anchorEl = hit.closest(selector) as HTMLElement | null
    const id = anchorEl?.dataset.hapiMessageId
    if (!id || !anchorEl) return null

    return { id, offsetTop: anchorEl.getBoundingClientRect().top - rect.top }
}

function collectVisibleAnchors(viewport: HTMLElement, selector: string, max: number): PrependScrollAnchorSnapshot[] {
    const vr = viewport.getBoundingClientRect()
    const els = viewport.querySelectorAll<HTMLElement>(selector)
    const out: PrependScrollAnchorSnapshot[] = []

    for (const el of els) {
        const id = el.dataset.hapiMessageId
        if (!id) continue

        const r = el.getBoundingClientRect()
        if (r.bottom <= vr.top + 1 || r.top >= vr.bottom - 1) continue

        out.push({ id, offsetTop: r.top - vr.top })
    }

    out.sort((a, b) => a.offsetTop - b.offsetTop)
    return out.slice(0, max)
}

export function capturePrependScrollSnapshot(
    viewport: HTMLElement,
    opts?: { selector?: string; maxAnchors?: number }
): PrependScrollSnapshot {
    const selector = opts?.selector ?? '[data-hapi-message-id]'
    const max = opts?.maxAnchors ?? 12

    const probe = probeAnchorAtPoint(viewport, selector)
    const visible = collectVisibleAnchors(viewport, selector, max)

    const anchors: PrependScrollAnchorSnapshot[] = []
    if (probe) anchors.push(probe)
    for (const a of visible) {
        if (!anchors.some((e) => e.id === a.id)) anchors.push(a)
    }

    return { scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight, anchors }
}

// ---------------------------------------------------------------------------
// Restore – run AFTER the DOM commit (useLayoutEffect)
// ---------------------------------------------------------------------------

function findAnchorById(viewport: HTMLElement, id: string): HTMLElement | null {
    return viewport.querySelector<HTMLElement>(`[data-hapi-message-id="${CSS.escape(id)}"]`)
}

function applyAnchorCorrection(
    viewport: HTMLElement,
    snapshot: PrependScrollSnapshot
): PrependScrollAnchorSnapshot | null {
    if (snapshot.anchors.length === 0) return null

    const vr = viewport.getBoundingClientRect()

    for (const anchor of snapshot.anchors) {
        const el = findAnchorById(viewport, anchor.id)
        if (!el) continue

        const currentOffset = el.getBoundingClientRect().top - vr.top
        const diff = currentOffset - anchor.offsetTop
        if (Number.isFinite(diff) && Math.abs(diff) > 0.5) {
            viewport.scrollTop += diff
        }
        return anchor
    }

    return null
}

function applyScrollHeightFallback(viewport: HTMLElement, snapshot: PrependScrollSnapshot): void {
    viewport.scrollTop = snapshot.scrollTop + (viewport.scrollHeight - snapshot.scrollHeight)
}

// ---------------------------------------------------------------------------
// Stabilizer – compensates for late layout shifts (images, code blocks, etc.)
//
// Uses a timestamp-based approach to distinguish programmatic scrollTop
// adjustments from real user scrolls.  The previous `applying` boolean flag
// was racy: setting `scrollTop` fires the scroll event *asynchronously*, so
// the flag was always false by the time the handler ran, causing the
// stabilizer to stop on its own first correction.
// ---------------------------------------------------------------------------

const PROGRAMMATIC_SCROLL_GRACE_MS = 120

function createStabilizer(params: {
    viewport: HTMLElement
    observeElement: Element
    anchorId: string
    expectedOffset: number
    maxMs: number
}): () => void {
    const { viewport, observeElement, anchorId, expectedOffset, maxMs } = params

    let lastAdjustAt = Date.now()
    let observer: ResizeObserver | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    let raf: number | null = null
    let stopped = false
    let cachedAnchor: HTMLElement | null = null

    const getAnchor = (): HTMLElement | null => {
        if (cachedAnchor && cachedAnchor.isConnected) return cachedAnchor
        cachedAnchor = findAnchorById(viewport, anchorId)
        return cachedAnchor
    }

    const stop = () => {
        if (stopped) return
        stopped = true
        if (raf !== null) cancelAnimationFrame(raf)
        viewport.removeEventListener('scroll', onUserScroll)
        observer?.disconnect()
        if (timeout !== null) clearTimeout(timeout)
    }

    const correct = () => {
        raf = null
        if (stopped) return

        const el = getAnchor()
        if (!el) { stop(); return }

        const vr = viewport.getBoundingClientRect()
        const currentOffset = el.getBoundingClientRect().top - vr.top
        const diff = currentOffset - expectedOffset

        if (Number.isFinite(diff) && Math.abs(diff) > 0.5) {
            lastAdjustAt = Date.now()
            viewport.scrollTop += diff
        }
    }

    const scheduleCorrection = () => {
        if (stopped || raf !== null) return
        raf = requestAnimationFrame(correct)
    }

    const onUserScroll = () => {
        if (stopped) return
        // Scroll events caused by our programmatic adjustments arrive
        // asynchronously; ignore them within the grace window.
        if (Date.now() - lastAdjustAt < PROGRAMMATIC_SCROLL_GRACE_MS) return
        // Real user scroll → stop compensating immediately.
        stop()
    }

    viewport.addEventListener('scroll', onUserScroll, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(scheduleCorrection)
        observer.observe(observeElement)
    }

    timeout = setTimeout(stop, maxMs)
    scheduleCorrection()

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
    const usedAnchor = applyAnchorCorrection(viewport, snapshot)

    if (!usedAnchor) {
        applyScrollHeightFallback(viewport, snapshot)
        return { usedAnchor: null, cleanup: null, didFallback: true }
    }

    const observeElement = opts?.observeElement ?? viewport
    const stabilizeMs = opts?.stabilizeMs ?? 1200
    if (!observeElement) {
        return { usedAnchor, cleanup: null, didFallback: false }
    }

    const cleanup = createStabilizer({
        viewport,
        observeElement,
        anchorId: usedAnchor.id,
        expectedOffset: usedAnchor.offsetTop,
        maxMs: stabilizeMs,
    })

    return { usedAnchor, cleanup, didFallback: false }
}
