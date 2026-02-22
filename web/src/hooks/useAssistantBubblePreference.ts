import { useCallback, useEffect, useState } from 'react'

const ASSISTANT_BUBBLE_STORAGE_KEY = 'hapi-assistant-bubble'
const ASSISTANT_BUBBLE_SYNC_EVENT = 'hapi:assistant-bubble-sync'

function isBrowser(): boolean {
    return typeof window !== 'undefined'
}

function readAssistantBubblePreference(): boolean {
    if (!isBrowser()) {
        return false
    }

    try {
        return localStorage.getItem(ASSISTANT_BUBBLE_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

function writeAssistantBubblePreference(enabled: boolean): void {
    if (!isBrowser()) {
        return
    }

    try {
        if (enabled) {
            localStorage.setItem(ASSISTANT_BUBBLE_STORAGE_KEY, 'true')
        } else {
            localStorage.removeItem(ASSISTANT_BUBBLE_STORAGE_KEY)
        }
    } catch {
        // Ignore storage errors to keep chat usable in restricted browser contexts.
    }

    window.dispatchEvent(new CustomEvent(ASSISTANT_BUBBLE_SYNC_EVENT))
}

export function useAssistantBubblePreference(): {
    assistantBubbleEnabled: boolean
    setAssistantBubbleEnabled: (enabled: boolean) => void
} {
    const [assistantBubbleEnabled, setAssistantBubbleEnabledState] = useState<boolean>(readAssistantBubblePreference)

    useEffect(() => {
        if (!isBrowser()) {
            return
        }

        const sync = () => {
            setAssistantBubbleEnabledState(readAssistantBubblePreference())
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key !== ASSISTANT_BUBBLE_STORAGE_KEY) {
                return
            }
            sync()
        }

        window.addEventListener('storage', onStorage)
        window.addEventListener(ASSISTANT_BUBBLE_SYNC_EVENT, sync)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener(ASSISTANT_BUBBLE_SYNC_EVENT, sync)
        }
    }, [])

    const setAssistantBubbleEnabled = useCallback((enabled: boolean) => {
        writeAssistantBubblePreference(enabled)
        setAssistantBubbleEnabledState(enabled)
    }, [])

    return { assistantBubbleEnabled, setAssistantBubbleEnabled }
}
