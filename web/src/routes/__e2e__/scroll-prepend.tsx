import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { capturePrependScrollSnapshot, restorePrependScrollSnapshot, type PrependScrollSnapshot } from '@/lib/prepend-scroll-retention'

type Item = {
    id: string
    height: number
    phase: 'stable' | 'will-expand' | 'expanded'
}

function makeItems(start: number, count: number, phase: Item['phase']): Item[] {
    const items: Item[] = []
    for (let i = 0; i < count; i += 1) {
        const n = start + i
        // Deterministic, varied height to approximate real chat bubbles.
        const height = 28 + (n % 5) * 10
        items.push({ id: `msg-${n}`, height, phase })
    }
    return items
}

export default function E2EScrollPrependPage() {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const contentRef = useRef<HTMLDivElement | null>(null)
    const pendingSnapshotRef = useRef<PrependScrollSnapshot | null>(null)
    const cleanupRef = useRef<(() => void) | null>(null)

    const [phase, setPhase] = useState<'idle' | 'loading' | 'expanding' | 'settled'>('idle')
    const [oldest, setOldest] = useState(1000)
    const [items, setItems] = useState<Item[]>(() => makeItems(1000, 50, 'stable'))

    const itemsVersion = items.length

    const canLoadMore = oldest > 800

    const loadOlder = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        if (!canLoadMore) return
        if (phase === 'loading' || phase === 'expanding') return

        cleanupRef.current?.()
        cleanupRef.current = null

        pendingSnapshotRef.current = capturePrependScrollSnapshot(viewport, { selector: '[data-hapi-message-id]', maxAnchors: 16 })
        setPhase('loading')

        // Simulate network + render delay.
        setTimeout(() => {
            const nextOldest = oldest - 50
            const batch = makeItems(nextOldest, 50, 'will-expand')
            setOldest(nextOldest)
            setItems((prev) => [...batch, ...prev])
        }, 80)
    }, [canLoadMore, oldest, phase])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        const snapshot = pendingSnapshotRef.current
        if (!viewport || !snapshot) return

        cleanupRef.current?.()
        const restored = restorePrependScrollSnapshot(viewport, snapshot, {
            selector: '[data-hapi-message-id]',
            observeElement: contentRef.current,
            stabilizeMs: 2000,
        })
        cleanupRef.current = restored.cleanup
        pendingSnapshotRef.current = null

        // Simulate late layout changes (markdown/images) in the newly prepended items.
        setPhase('expanding')
        setTimeout(() => {
            setItems((prev) => prev.map((item) => (item.phase === 'will-expand'
                ? { ...item, phase: 'expanded', height: item.height + 90 }
                : item)))
            setPhase('settled')
        }, 160)
    }, [itemsVersion])

    const statusLabel = useMemo(() => {
        const more = canLoadMore ? 'has-more' : 'no-more'
        return `${phase} · ${more} · items=${items.length}`
    }, [canLoadMore, items.length, phase])

    return (
        <div className="flex h-dvh w-dvw flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-3 py-2 text-xs">
                <div data-testid="status" data-phase={phase} className="font-mono opacity-80">
                    {statusLabel}
                </div>
                <button
                    data-testid="load-older"
                    className="rounded-md bg-[var(--app-button)] px-2 py-1 text-[var(--app-button-text)] disabled:opacity-40"
                    onClick={loadOlder}
                    disabled={!canLoadMore || phase === 'loading' || phase === 'expanding'}
                >
                    load older
                </button>
            </div>

            <div
                ref={viewportRef}
                data-testid="viewport"
                className="relative flex-1 overflow-y-auto px-3 py-3"
                style={{ overflowAnchor: 'none' }}
            >
                <div ref={contentRef} className="relative flex flex-col gap-2">
                    {phase === 'loading' ? (
                        <div className="pointer-events-none absolute top-0 left-0 right-0 flex justify-center text-xs opacity-70">
                            loading…
                        </div>
                    ) : null}

                    {items.map((item) => (
                        <div
                            key={item.id}
                            data-hapi-message-id={item.id}
                            className="rounded-md bg-[var(--app-subtle-bg)] px-2 py-2"
                            style={{ height: item.height }}
                        >
                            <div className="flex items-center justify-between text-xs font-mono opacity-80">
                                <span data-testid={item.id === `msg-${oldest}` ? 'first-visible' : undefined}>{item.id}</span>
                                <span>{item.phase}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

