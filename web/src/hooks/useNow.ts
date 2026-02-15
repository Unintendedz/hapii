import { useEffect, useState } from 'react'

export function useNow(options?: { enabled?: boolean; intervalMs?: number }): number {
    const enabled = options?.enabled ?? true
    const intervalMs = options?.intervalMs ?? 1000
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!enabled) {
            return
        }

        setNow(Date.now())
        const id = setInterval(() => {
            setNow(Date.now())
        }, intervalMs)

        return () => {
            clearInterval(id)
        }
    }, [enabled, intervalMs])

    return now
}

