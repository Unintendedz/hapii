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

export function applyUpdate() {
    if (_updateSW) {
        _updateSW(true)
    } else {
        window.location.reload()
    }
}

export function subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => {
        _listeners.delete(fn)
    }
}
