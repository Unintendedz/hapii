import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
    isUpdateAvailable,
    getLatestBuild,
    subscribe,
    applyUpdate,
    triggerSwCheck,
    markUpdateAvailable
} from '@/lib/sw-update'

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

function getSnapshot() {
    return isUpdateAvailable()
}

function getServerSnapshot() {
    return false
}

async function checkVersion() {
    try {
        const res = await fetch(`/version.json?_t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { build?: string }
        if (data.build && data.build !== __APP_BUILD__) {
            markUpdateAvailable(data.build)
            triggerSwCheck()
        }
    } catch {
        // Network error – silently ignore
    }
}

export function useAppUpdate() {
    const updateAvailable = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    useEffect(() => {
        // Check immediately on mount
        checkVersion()

        const id = setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS)
        return () => clearInterval(id)
    }, [])

    const doUpdate = useCallback(() => {
        applyUpdate()
    }, [])

    return {
        updateAvailable,
        latestBuild: getLatestBuild(),
        applyUpdate: doUpdate
    }
}
