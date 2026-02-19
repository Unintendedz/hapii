/**
 * Module-level state for service worker updates.
 *
 * Bridges the vanilla-JS `registerSW` call in main.tsx with React
 * components that need to show an update banner.
 */

type Listener = () => void

let _updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null
let _registration: ServiceWorkerRegistration | null = null
let _updateAvailable = false
let _latestBuild: string | null = null
let _reloadPage: () => void = () => {
    window.location.reload()
}
const _listeners = new Set<Listener>()

function notify() {
    for (const fn of _listeners) {
        fn()
    }
}

export function setUpdateSW(fn: (reloadPage?: boolean) => Promise<void>) {
    _updateSW = fn
}

export function setRegistration(reg: ServiceWorkerRegistration) {
    _registration = reg
}

export function setReloadPageForTesting(fn: () => void) {
    _reloadPage = fn
}

export function markUpdateAvailable(build?: string) {
    _updateAvailable = true
    if (build) {
        _latestBuild = build
    }
    notify()
}

export function isUpdateAvailable() {
    return _updateAvailable
}

export function getLatestBuild() {
    return _latestBuild
}

export function triggerSwCheck() {
    _registration?.update()
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function waitForWaitingWorker(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<ServiceWorker | null> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        if (reg.waiting) {
            return reg.waiting
        }
        await sleep(200)
    }
    return reg.waiting ?? null
}

export async function applyUpdate(): Promise<void> {
    // Best-effort update flow.
    // - If SW update already waiting: tell it to skip waiting, then reload.
    // - If SW registered but not waiting yet: ask it to check updates, wait briefly, then try again.
    // - If no SW (http / unsupported env): just reload.
    try {
        const reg = _registration
        if (reg) {
            try {
                await reg.update()
            } catch {
                // ignore: still allow reload
            }

            const waiting = await waitForWaitingWorker(reg, 3_000)
            if (waiting) {
                waiting.postMessage({ type: 'SKIP_WAITING' })
                // Give the message a moment to be handled before we reload.
                await sleep(100)
            } else {
                // In `registerType: 'autoUpdate'`, vite-plugin-pwa's `updateSW()` is a no-op.
                // Keep this as a best-effort fallback for other modes.
                try {
                    await _updateSW?.(true)
                } catch {
                    // ignore
                }
            }
        }
    } finally {
        _reloadPage()
    }
}

export function subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => {
        _listeners.delete(fn)
    }
}
